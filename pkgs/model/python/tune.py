"""Predeclared tree-CNN search. Never opens test.bin or inspects test reports."""
import argparse
import copy
import hashlib
import json
import random
import faulthandler
import signal
import fcntl
import subprocess
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from progress import Progress

from worker import data_for, device_for, measure


BASE = dict(embedding=24, channels=32, hidden=64, dilations=[1], nearest=16, contextualNearest=0, dropout=.15)
WIDE = dict(embedding=64, channels=96, hidden=256, dilations=[1], nearest=32, contextualNearest=0, dropout=.2)
DEEP = dict(WIDE, dilations=[1, 2, 4], contextualNearest=16)
EXPERIMENTS = [
    dict(name="long-baseline", architecture=BASE, weightDecay=1e-4),
    dict(name="wide", architecture=WIDE, weightDecay=1e-4),
    dict(name="contextual", architecture=DEEP, weightDecay=1e-4),
    dict(name="contextual-regularized", architecture=dict(DEEP, dropout=.35), weightDecay=1e-3),
]
LOG = None


class ContextCNN(nn.Module):
    def __init__(self, vocabulary, architecture, backend="native"):
        super().__init__()
        self.a = architecture
        self.backend = backend
        a = architecture
        self.embedding = nn.Embedding(vocabulary, a["embedding"])
        self.convs = nn.ModuleList([
            nn.Conv1d(a["embedding"] if i == 0 else a["channels"], a["channels"], 3, padding=d, dilation=d)
            for i, d in enumerate(a["dilations"])
        ])
        side = a["channels"] * 2 + a["nearest"] * a["embedding"] + a["contextualNearest"] * a["channels"]
        self.hidden = nn.Linear(side * 2, a["hidden"])
        self.dropout = nn.Dropout(a["dropout"])
        self.output = nn.Linear(a["hidden"], 1)
        nn.init.uniform_(self.embedding.weight, -.05, .05)
        for layer in [*self.convs, self.hidden, self.output]:
            nn.init.xavier_uniform_(layer.weight)
            nn.init.zeros_(layer.bias)

    def side(self, tokens, left):
        a = self.a
        embedded = self.embedding(tokens)
        patterns = embedded.transpose(1, 2)
        for conv in self.convs:
            if self.backend == "expanded" and conv.dilation[0] > 1:
                # Exactly the same dilated kernel with explicit zero taps. This avoids
                # slow ROCm dilated-convolution solvers without changing parameters.
                d = conv.dilation[0]
                kernel = F.pad(conv.weight.unsqueeze(-1), (0, d-1)).flatten(-2)[..., :-(d-1)]
                patterns = F.conv1d(patterns, kernel, conv.bias, padding=d).relu()
            else:
                patterns = conv(patterns).relu()
        near = embedded[:, -a["nearest"]:] if left else embedded[:, :a["nearest"]]
        features = [patterns.amax(dim=2), patterns.mean(dim=2), near.flatten(1)]
        if a["contextualNearest"]:
            contextual = patterns.transpose(1, 2)
            near = contextual[:, -a["contextualNearest"]:] if left else contextual[:, :a["contextualNearest"]]
            features.append(near.flatten(1))
        return features

    def forward(self, tokens):
        n = tokens.shape[1] // 2
        features = torch.cat(self.side(tokens[:, :n], True) + self.side(tokens[:, n:], False), dim=1)
        return self.output(self.dropout(self.hidden(features).relu())).squeeze(1)


def dump(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def export(model, root, parity):
    arrays = [("bpe_embedding/embeddings", model.embedding.weight)]
    for i, conv in enumerate(model.convs):
        name = "shared_patterns" if i == 0 else f"shared_patterns_{i}"
        arrays.extend([(name + "/kernel", conv.weight.permute(2, 1, 0)), (name + "/bias", conv.bias)])
    arrays.extend([("hidden/kernel", model.hidden.weight.T), ("hidden/bias", model.hidden.bias),
                   ("blank_line_probability/kernel", model.output.weight.T), ("blank_line_probability/bias", model.output.bias)])
    specs = []
    with (root / "export.bin").open("wb") as stream:
        for name, tensor in arrays:
            value = tensor.detach().cpu().contiguous().numpy().astype("<f4")
            specs.append(dict(name=name, shape=list(value.shape)))
            stream.write(value.tobytes())
    dump(root / "export.json", specs)
    model.eval()
    with torch.inference_mode():
        scores = model(parity).sigmoid().cpu().numpy()
    dump(root / "parity.json", dict(tokens=parity.cpu().tolist(), scores=scores.tolist()))


@torch.inference_mode()
def predictions(model, x, size=512, interval=10):
    model.eval()
    values, begin, last = [], time.monotonic(), time.monotonic()
    for i in range(0, len(x), size):
        values.append(model(x[i:i+size]).sigmoid().cpu().numpy())
        now = time.monotonic()
        if LOG and (now-last >= interval or i+size >= len(x)):
            done = min(i+size,len(x))
            LOG.emit("validation-progress", samples=done, total=len(x), percent=100*done/len(x),
                     samplesPerSecond=done/(now-begin), etaSeconds=(len(x)-done)*(now-begin)/done)
            last = now
    return np.concatenate(values)


def fit(spec, seed, args, manifest, manifest_hash, train_x, train_y, val_x, val_y):
    root = args.out / f'{spec["name"]}-seed{seed}'
    if root.exists():
        if not args.resume:
            raise RuntimeError(f"Run already exists: {root}")
        existing = json.loads((root / "run.json").read_text())
        for key,value in dict(seed=seed,architecture=spec["architecture"],weightDecay=spec["weightDecay"],
                              maximumEpochs=args.epochs,batchSize=args.batch_size,encodedManifestHash=manifest_hash).items():
            if existing[key] != value:
                raise RuntimeError(f"Cannot resume: {root} {key} changed")
        if all((root / name).exists() for name in ["config.json", "parity.json", "export.json", "export.bin", "validation-scores.npy", "best.pt"]):
            config = json.loads((root / "config.json").read_text())
            LOG.phase("reuse-completed", run=root.name, bestEpoch=config["bestEpoch"], bestValidationLoss=config["validation"]["logLoss"])
            return root, config
        if not (root / "last.pt").exists():
            archive = root.with_name(root.name + ".interrupted-" + time.strftime("%Y%m%dT%H%M%S"))
            root.rename(archive)
            LOG.emit("restart-incomplete", run=root.name, archived=str(archive), reason="No completed-epoch resume checkpoint; replaying from original seed")
    root.mkdir(exist_ok=True)
    (root / "INCOMPLETE").touch()
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    LOG.phase("initialize-model", run=root.name, seed=seed, backend=args.conv_backend)
    model = ContextCNN(manifest["tokenizer"]["vocabulary"], spec["architecture"], args.conv_backend).to(train_x.device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=spec["weightDecay"], foreach=False)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=.5, patience=2, threshold=1e-4, threshold_mode="abs", min_lr=1e-5)
    loss_fn = nn.BCEWithLogitsLoss()
    config = dict(schema=1, modelName="spacer-tree-sitter", trainer="PyTorch/ROCm", seed=seed,
                  architecture=spec["architecture"], optimizer="AdamW", weightDecay=spec["weightDecay"],
                  initialLearningRate=.001, scheduler="ReduceLROnPlateau(factor=.5, patience=2, min_lr=1e-5)",
                  gradientClip=1., batchSize=args.batch_size, maximumEpochs=args.epochs, earlyStoppingPatience=8,
                  tokensPerSide=manifest["tokensPerSide"], context=manifest["corpus"]["context"], tokenizer=manifest["tokenizer"],
                  parameters=sum(p.numel() for p in model.parameters()), encodedManifestHash=manifest_hash,
                  corpusManifestHash=manifest["corpusManifestHash"], checkpointSelection="minimum validation log loss",
                  torch=torch.__version__, hip=torch.version.hip, device=torch.cuda.get_device_name(train_x.device), convolutionBackend=args.conv_backend,
                  optimizerImplementation="per-tensor (foreach=False)")
    dump(root / "run.json", config)
    history, best, stale, best_epoch = [], float("inf"), 0, 0
    first_epoch, previous_seconds = 1, 0.
    if (root / "last.pt").exists():
        # Trusted, locally generated training checkpoint, including optimizer and RNG state.
        checkpoint = torch.load(root / "last.pt", map_location="cpu", weights_only=False)
        model.load_state_dict(checkpoint["model"])
        optimizer.load_state_dict(checkpoint["optimizer"])
        # Older checkpoints restore foreach=None; retain moments/LR but select
        # the conservative per-tensor backend after the observed ROCm hang.
        for group in optimizer.param_groups:
            group["foreach"] = False
        scheduler.load_state_dict(checkpoint["scheduler"])
        history, best, stale, best_epoch = (checkpoint[k] for k in ["history","best","stale","best_epoch"])
        first_epoch, previous_seconds = checkpoint["epoch"]+1, checkpoint["elapsedSeconds"]
        torch.set_rng_state(checkpoint["cpu_rng"])
        torch.cuda.set_rng_state_all(checkpoint["gpu_rng"])
        LOG.emit("resume-epoch", run=root.name, nextEpoch=first_epoch, bestEpoch=best_epoch, bestValidationLoss=best)
        del checkpoint
    started = time.monotonic()
    LOG.emit("run-start", run=root.name, parameters=config["parameters"], trainExamples=len(train_x), validationExamples=len(val_x), maxEpochs=args.epochs)
    for epoch in range(first_epoch, args.epochs + 1):
        if epoch > 12 and stale >= 8:
            break
        model.train()
        begin = time.monotonic()
        last = begin
        LOG.phase("train", run=root.name, epoch=epoch, maxEpochs=args.epochs, batch=0,
                  batches=(len(train_x)+args.batch_size-1)//args.batch_size, learningRate=optimizer.param_groups[0]["lr"])
        order = torch.randperm(len(train_x), device=train_x.device)
        loss_total = torch.zeros((), device=train_x.device)
        rate = optimizer.param_groups[0]["lr"]
        for start in range(0, len(order), args.batch_size):
            idx = order[start:start+args.batch_size]
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(train_x[idx]), train_y[idx])
            loss.backward()
            grad_norm = nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True)
            optimizer.step()
            loss_total += loss.detach() * len(idx)
            now = time.monotonic()
            if start == 0 or now-last >= args.log_seconds or start+len(idx) == len(order):
                done = start+len(idx)
                LOG.emit("train-progress", batch=start//args.batch_size+1, samples=done, total=len(order), percent=100*done/len(order),
                         batchLoss=float(loss.detach()), trainingLoss=float(loss_total)/done,
                         gradientNorm=float(grad_norm), learningRate=rate, samplesPerSecond=done/(now-begin),
                         elapsedSeconds=now-begin, etaSeconds=(len(order)-done)*(now-begin)/done,
                         gpuAllocatedGiB=torch.cuda.memory_allocated()/2**30, gpuReservedGiB=torch.cuda.memory_reserved()/2**30,
                         gpuPeakGiB=torch.cuda.max_memory_allocated()/2**30)
                last = now
        LOG.phase("validation", run=root.name, epoch=epoch)
        scores = predictions(model, val_x, args.batch_size, args.log_seconds)
        evaluation = measure(val_y, scores)
        if not np.isfinite(evaluation["logLoss"]):
            raise RuntimeError("Non-finite validation loss")
        row = dict(epoch=epoch, trainingLoss=float(loss_total)/len(train_x), validation=evaluation,
                   learningRate=rate, elapsedSeconds=time.monotonic()-begin)
        history.append(row)
        old_best = best
        # Save every improvement; stopping uses a small tolerance to avoid noisy resets.
        if evaluation["logLoss"] < best:
            meaningful = evaluation["logLoss"] < best - 1e-4
            best, best_epoch = evaluation["logLoss"], epoch
            torch.save(model.state_dict(), root / "best.pt")
            np.save(root / "validation-scores.npy", scores)
            stale = 0 if meaningful else stale + 1
        else:
            stale += 1
        scheduler.step(evaluation["logLoss"])
        row.update(bestEpoch=best_epoch, bestValidationLoss=best, improved=evaluation["logLoss"] < old_best,
                   staleEpochs=stale, nextLearningRate=optimizer.param_groups[0]["lr"])
        dump(root / "history.json", history)
        LOG.emit("epoch-end", trainingLoss=row["trainingLoss"], validationLoss=evaluation["logLoss"],
                 validationF1=evaluation["f1"], validationAccuracy=evaluation["accuracy"],
                 validationPrecision=evaluation["precision"], validationRecall=evaluation["recall"],
                 bestValidationLoss=best, bestEpoch=best_epoch, improved=row["improved"], staleEpochs=stale,
                 patience=8, learningRate=rate, nextLearningRate=row["nextLearningRate"], elapsedSeconds=row["elapsedSeconds"])
        LOG.phase("checkpoint", run=root.name, epoch=epoch)
        torch.save(dict(model=model.state_dict(), optimizer=optimizer.state_dict(), scheduler=scheduler.state_dict(),
                        history=history, best=best, stale=stale, best_epoch=best_epoch, epoch=epoch,
                        elapsedSeconds=previous_seconds+time.monotonic()-started,
                        cpu_rng=torch.get_rng_state(),gpu_rng=torch.cuda.get_rng_state_all()), root / "last.pt.tmp")
        (root / "last.pt.tmp").replace(root / "last.pt")
        if epoch >= 12 and stale >= 8:
            break
    model.load_state_dict(torch.load(root / "best.pt", map_location=train_x.device, weights_only=True))
    LOG.phase("export-weights", run=root.name, bestEpoch=best_epoch, bestValidationLoss=best)
    config.update(bestEpoch=best_epoch, epochsCompleted=len(history), elapsedMs=(previous_seconds+time.monotonic()-started)*1000,
                  threshold=.5, validation=measure(val_y, np.load(root / "validation-scores.npy")))
    dump(root / "config.json", config)
    # Fixed, evenly spaced training examples; no held-out examples are used for export validation.
    parity = train_x[torch.linspace(0, len(train_x)-1, 128, device=train_x.device).long()]
    export(model, root, parity)
    (root / "TRAINING-COMPLETE").touch()
    LOG.emit("run-complete", run=root.name, bestEpoch=best_epoch, bestValidationLoss=best, epochsCompleted=len(history))
    del model, optimizer
    torch.cuda.empty_cache()
    return root, config


def main():
    global LOG
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("tmp/model-encoded-tree-sitter"))
    p.add_argument("--out", type=Path, default=Path("tmp/tree-tuning"))
    p.add_argument("--baseline", type=Path, default=Path("tmp/spacer-tree-sitter"))
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--batch-size", type=int, default=512)
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--resume", action="store_true")
    p.add_argument("--log-seconds", type=float, default=10)
    p.add_argument("--conv-backend", choices=["native","expanded"], default="expanded")
    args = p.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.log_seconds <= 0:
        raise ValueError("epochs and batch size must be positive")
    torch.set_num_threads(8)
    device = device_for("auto")
    args.out.mkdir(parents=True, exist_ok=args.resume)
    lock = (args.out / "RUNNING.lock").open("w")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    LOG = Progress(args.out, args.log_seconds)
    LOG.phase("startup", resume=args.resume, backend=args.conv_backend, output=str(args.out))
    faulthandler.enable()
    faulthandler.register(signal.SIGUSR1, all_threads=True)
    if args.smoke:
        # Exercise the most complex architecture, backwards, serialization and TS export.
        torch.manual_seed(42)
        model = ContextCNN(512, DEEP, args.conv_backend).to(device)
        x = torch.randint(0, 512, (32, 256), dtype=torch.int32, device=device)
        y = torch.randint(0, 2, (32,), device=device).float()
        optimizer = torch.optim.AdamW(model.parameters(), lr=.001, foreach=False)
        for _ in range(3):
            optimizer.zero_grad()
            loss = nn.BCEWithLogitsLoss()(model(x), y)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True)
            optimizer.step()
        export(model, args.out, x)
        dump(args.out / "config.json", dict(tokensPerSide=128, seed=42, tokenizer=dict(vocabulary=512), architecture=DEEP))
        LOG.emit("smoke-complete", loss=float(loss.detach()))
        return
    if (args.data / "INCOMPLETE").exists():
        raise RuntimeError("Incomplete encoded data")
    raw = (args.data / "manifest.json").read_bytes()
    manifest = json.loads(raw)
    manifest_hash = hashlib.sha256(raw).hexdigest()
    baseline = json.loads((args.baseline / "config.json").read_text())
    if baseline["encodedManifestHash"] != manifest_hash:
        raise RuntimeError("Baseline and experiments must use the same encoded data")
    protocol = Path("pkgs/model/TREE-TUNING-PROTOCOL.md").read_bytes()
    plan = dict(experiments=EXPERIMENTS, seeds=[42, 123, 2026], epochs=args.epochs,
         encodedManifestHash=manifest_hash, protocolSha256=hashlib.sha256(protocol).hexdigest(),
         selection="validation log loss; prefer simpler within .0005", testAccess="none during search")
    if args.resume:
        if json.loads((args.out / "plan.json").read_text()) != plan:
            raise RuntimeError("Resume plan differs from predeclared plan")
        if (args.out / "selection.json").exists():
            raise RuntimeError("Selection already frozen; use export/finalize instead of restarting search")
    else:
        (args.out / "protocol.md").write_bytes(protocol)
        dump(args.out / "plan.json",plan)
    LOG.phase("load-data", trainExamples=manifest["splits"]["train"]["count"], validationExamples=manifest["splits"]["eval"]["count"])
    train = data_for(args.data, "train", manifest)
    validation = data_for(args.data, "eval", manifest)
    # Resident int32 tokens avoid repeated host copies; 4 GB on the 24 GB GPU.
    train_x = torch.from_numpy(np.array(train[:, :-2], dtype=np.int32)).to(device)
    train_y = torch.from_numpy(np.array(train[:, -2], dtype=np.float32)).to(device)
    val_x = torch.from_numpy(np.array(validation[:, :-2], dtype=np.int32)).to(device)
    val_y = np.array(validation[:, -2], dtype=np.uint8)
    trials = [fit(spec, 42, args, manifest, manifest_hash, train_x, train_y, val_x, val_y) for spec in EXPERIMENTS]
    best_root, best_config = min(trials, key=lambda item: item[1]["validation"]["logLoss"])
    best_spec = next(s for s in EXPERIMENTS if best_root.name == s["name"] + "-seed42")
    replicas = [(best_root, best_config)]
    for seed in [123, 2026]:
        replicas.append(fit(best_spec, seed, args, manifest, manifest_hash, train_x, train_y, val_x, val_y))
    ensemble_scores = np.mean([np.load(root / "validation-scores.npy") for root, _ in replicas], axis=0)
    ensemble = args.out / "ensemble"
    ensemble.mkdir(exist_ok=args.resume)
    cfg = copy.deepcopy(best_config)
    cfg.update(members=["../" + root.name for root, _ in replicas], parameters=sum(c["parameters"] for _, c in replicas),
               validation=measure(val_y, ensemble_scores), ensembleSeeds=[42, 123, 2026])
    np.save(ensemble / "validation-scores.npy", ensemble_scores)
    dump(ensemble / "config.json", cfg)
    parities = [json.loads((root / "parity.json").read_text()) for root, _ in replicas]
    if any(p["tokens"] != parities[0]["tokens"] for p in parities):
        raise RuntimeError("Misaligned ensemble parity")
    dump(ensemble / "parity.json", dict(tokens=parities[0]["tokens"], scores=np.mean([p["scores"] for p in parities], axis=0).tolist()))
    choices = trials + replicas[1:] + [(ensemble, cfg), (args.baseline, baseline)]
    minimum = min(c["validation"]["logLoss"] for _, c in choices)
    selected, config = min([(r,c) for r,c in choices if c["validation"]["logLoss"] <= minimum+.0005], key=lambda item: item[1]["parameters"])
    if selected != args.baseline:
        scores = np.load(selected / "validation-scores.npy")
        calibrated = max([measure(val_y, scores, t/100) for t in range(5,96)], key=lambda m:m["f1"])
        config.update(threshold=calibrated["threshold"], validation=calibrated, thresholdSelection="maximum validation F1 on predeclared .05-.95 grid")
        dump(selected / "config.json", config)
    # Freeze the decision before any test evaluation. The suite intentionally never evaluates test.
    dump(args.out / "selection.json", dict(selected=str(selected), encodedManifestHash=manifest_hash,
         threshold=config["threshold"], validation=config["validation"],
         candidates=[dict(path=str(r), logLoss=c["validation"]["logLoss"], parameters=c["parameters"]) for r,c in choices],
         frozenAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), testAccessed=False))
    if selected == ensemble:
        for root, _ in replicas:
            subprocess.run(["node", "pkgs/model/src/rocm.ts", "export", "--out", str(root)], check=True)
    if selected != args.baseline:
        subprocess.run(["node", "pkgs/model/src/rocm.ts", "export", "--out", str(selected)], check=True)
    LOG.phase("complete", selected=str(selected), validation=config["validation"], testAccessed=False)


if __name__ == "__main__":
    def stop_training(signum, frame):
        raise KeyboardInterrupt(f"Received signal {signum}; resume from last completed epoch")
    signal.signal(signal.SIGTERM, stop_training)
    try:
        main()
    except BaseException as error:
        if LOG:
            LOG.emit("interrupted" if isinstance(error,KeyboardInterrupt) else "failed", error=repr(error))
        raise
    finally:
        if LOG:
            LOG.close()
