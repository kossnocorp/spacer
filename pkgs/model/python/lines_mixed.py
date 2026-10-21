"""From-scratch bilingual lexical search. Training/search never opens test.bin."""
import argparse
import fcntl
import hashlib
import json
import platform
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from research_v2 import dump, make_model
from tune import BASE, ContextCNN
from worker import device_for, measure


SPECS = {
    "baseline": dict(BASE),
    "context-small": dict(BASE, embedding=32, channels=32, hidden=128,
                          nearest=24, contextualNearest=8, dropout=.25),
    "context-dilated": dict(BASE, embedding=32, channels=48, hidden=128,
                            dilations=[1, 2], nearest=24, contextualNearest=8, dropout=.3),
}
DATA = Path("tmp/encoded-v2-original")
ROOT = Path("tmp/lines-mixed-v1")
REPORT = Path("docs/benchmark-data/lines-mixed-v1")
REFERENCE = Path("tmp/research-v2-original-gpu/cross-attention-mixed-seed42")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class LexicalCNN(nn.Module):
    def __init__(self, spec):
        super().__init__()
        self.base = ContextCNN(100278, spec, "expanded")

    def forward(self, x):
        return self.base(x[:, :256])


def rows_for(split, manifest):
    n = manifest["splits"][split]["count"]
    path = DATA / f"{split}.bin"
    if path.stat().st_size != n * 387 * 4:
        raise ValueError(f"Invalid {split} size")
    return np.memmap(path, dtype="<u4", mode="r", shape=(n, 387))


@torch.inference_mode()
def predict(model, rows, device, width=256):
    model.eval()
    scores = np.empty(len(rows), dtype=np.float32)
    for start in range(0, len(rows), 512):
        x = torch.from_numpy(np.array(rows[start:start+512, :width], dtype=np.int32)).to(device)
        scores[start:start+len(x)] = model(x).sigmoid().cpu().numpy()
    return scores


def calibrate(labels, scores):
    # Same .100-.900/.005 grid as v2, without recomputing log loss 161 times.
    grid = np.arange(100, 901, 5) / 1000
    bins = np.searchsorted(grid.astype(scores.dtype), scores, side="right")
    positive = np.bincount(bins[labels == 1], minlength=len(grid)+1)
    negative = np.bincount(bins[labels == 0], minlength=len(grid)+1)
    tp = positive.sum() - positive.cumsum()[:-1]
    fp = negative.sum() - negative.cumsum()[:-1]
    fn = positive.sum() - tp
    accuracy = (tp + negative.sum() - fp) / len(labels)
    f1 = 2*tp / np.maximum(2*tp+fp+fn, 1)
    best = max(range(len(grid)), key=lambda i: (accuracy[i], f1[i]))
    return measure(labels, scores, float(grid[best]))


def metrics(rows, scores, threshold):
    y, language = np.asarray(rows[:, 384]), np.asarray(rows[:, 386])
    return {"overall": measure(y, scores, threshold), "byLanguage": {
        name: measure(y[language == code], scores[language == code], threshold)
        for name, code in [("typescript", 0), ("rust", 1)]}}


def train(name, seed, train_rows, val_rows, protocol, device):
    root = ROOT / f"{name}-seed{seed}"
    settings = dict(protocolSha256=sha(ROOT / "protocol.json"), name=name, seed=seed, spec=SPECS[name])
    root.mkdir(parents=True, exist_ok=True)
    if (root / "run.json").exists():
        if json.loads((root / "run.json").read_text()) != settings:
            raise ValueError("Incompatible resume")
    else:
        dump(root / "run.json", settings)
    if (root / "config.json").exists():
        return json.loads((root / "config.json").read_text())
    torch.manual_seed(seed)
    model = LexicalCNN(SPECS[name]).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.001, foreach=False)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=.5, patience=2, min_lr=1e-5)
    history, best, stale = [], float("inf"), 0
    if (root / "last.pt").exists():
        saved = torch.load(root / "last.pt", map_location="cpu", weights_only=False)
        model.load_state_dict(saved["model"])
        optimizer.load_state_dict(saved["optimizer"])
        scheduler.load_state_dict(saved["scheduler"])
        torch.set_rng_state(saved["rng"])
        torch.cuda.set_rng_state(saved["gpuRng"], device)
        history, best, stale = saved["history"], saved["best"], saved["stale"]
    for epoch in range(len(history)+1, protocol["epochs"]+1):
        if stale >= 7:
            break
        model.train()
        order = np.random.default_rng(seed+epoch).permutation(len(train_rows))
        begin = last = time.monotonic()
        total, seen = 0., 0
        for start in range(0, len(order), 512):
            batch = train_rows[order[start:start+512]]
            x = torch.from_numpy(np.array(batch[:, :256], dtype=np.int32)).to(device)
            y = torch.from_numpy(np.array(batch[:, 384], dtype=np.float32)).to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = nn.functional.binary_cross_entropy_with_logits(model(x), y)
            if not torch.isfinite(loss):
                raise ValueError("Nonfinite loss")
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.)
            optimizer.step()
            total += loss.detach().item()*len(batch)
            seen += len(batch)
            if time.monotonic()-last > 30:
                event = dict(run=root.name, epoch=epoch, seen=seen, total=len(order),
                             loss=total/seen, samplesPerSecond=seen/(time.monotonic()-begin))
                dump(ROOT / "progress.json", event)
                print(json.dumps(event), flush=True)
                last = time.monotonic()
        scores = predict(model, val_rows, device)
        evaluation = measure(np.asarray(val_rows[:, 384]), scores)
        history.append(dict(epoch=epoch, trainingLoss=total/seen, validation=evaluation,
                            seconds=time.monotonic()-begin))
        if evaluation["logLoss"] < best-.0001:
            best, stale = evaluation["logLoss"], 0
            torch.save(model.state_dict(), root / "best.pt.tmp")
            (root / "best.pt.tmp").replace(root / "best.pt")
            np.save(root / "validation-scores.npy", scores)
        else:
            stale += 1
        scheduler.step(evaluation["logLoss"])
        dump(root / "history.json", history)
        torch.save(dict(model=model.state_dict(), optimizer=optimizer.state_dict(), scheduler=scheduler.state_dict(),
                        history=history, best=best, stale=stale, rng=torch.get_rng_state(),
                        gpuRng=torch.cuda.get_rng_state(device)), root / "last.pt.tmp")
        (root / "last.pt.tmp").replace(root / "last.pt")
        print(json.dumps(dict(run=root.name, **history[-1])), flush=True)
    scores = np.load(root / "validation-scores.npy")
    selected = calibrate(np.asarray(val_rows[:, 384]), scores)
    result = dict(**settings, path=str(root), weightsSha256=sha(root / "best.pt"),
                  parameters=sum(p.numel() for p in model.parameters()),
                  validation=metrics(val_rows, scores, selected["threshold"]), history=history)
    dump(root / "config.json", result)
    dump(REPORT / f"{root.name}.json", result)
    return result


@torch.inference_mode()
def speed(model, rows, width):
    model = model.cpu().eval()
    results = {}
    for language, code in [("typescript", 0), ("rust", 1)]:
        indices = np.flatnonzero(rows[:, 386] == code)
        indices = indices[np.linspace(0, len(indices)-1, 8192, dtype=np.int64)]
        x = torch.from_numpy(np.array(rows[indices, :width], dtype=np.int32))
        for batch, count in [(1, 128), (512, 8192)]:
            model(x[:batch])
            timings = []
            for _ in range(20):
                start = time.perf_counter()
                for i in range(0, count, batch):
                    model(x[i:i+batch])
                timings.append(time.perf_counter()-start)
            results[f"{language}/batch{batch}"] = dict(boundariesPerSecond=count/float(np.median(timings)),
                                                       seconds=timings, boundaries=count)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=40)
    args = parser.parse_args()
    if args.epochs < 1:
        parser.error("epochs must be positive")
    ROOT.mkdir(parents=True, exist_ok=True)
    lock = Path("tmp/research-v2-GPU.lock").open("w")
    fcntl.flock(lock, fcntl.LOCK_EX)
    if (DATA / "INCOMPLETE").exists():
        raise ValueError("Incomplete corpus")
    torch.set_num_threads(8)
    device = device_for("auto")
    manifest = json.loads((DATA / "manifest.json").read_text())
    reference = json.loads((REFERENCE / "config.json").read_text())
    if reference["encodedManifestSha256"] != sha(DATA / "manifest.json"):
        raise ValueError("Reference membership mismatch")
    protocol = dict(epochs=args.epochs, candidates=SPECS, primarySeed=42, confirmationSeed=123,
                    encodedManifestSha256=sha(DATA / "manifest.json"),
                    implementationSha256=hashlib.sha256(b"".join((Path(__file__).parent / p).read_bytes()
                        for p in ["lines_mixed.py", "tune.py", "worker.py", "research_v2.py"])).hexdigest(),
                    checkpointSelection="minimum validation loss; minimum improvement .0001; patience 7",
                    thresholdSelection="single shared threshold; validation accuracy then F1; .100:.005:.900",
                    architectureSelection="maximum macro language validation accuracy; then overall F1",
                    training="full mixed train membership, natural language frequency, batch 512, FP32, AdamW .001/.001",
                    testAccess="none; freeze selection before a separate one-shot evaluation",
                    referenceWeightsSha256=sha(REFERENCE / "best.pt"),
                    torch=torch.__version__, device=torch.cuda.get_device_name(device))
    if (ROOT / "protocol.json").exists():
        if json.loads((ROOT / "protocol.json").read_text()) != protocol:
            raise ValueError("Protocol changed; use a new experiment lineage")
    else:
        dump(ROOT / "protocol.json", protocol)
    dump(REPORT / "protocol.json", protocol)
    train_rows, val_rows = [rows_for(split, manifest) for split in ["train", "eval"]]
    trials = [train(name, 42, train_rows, val_rows, protocol, device) for name in SPECS]
    selected = max(trials, key=lambda t: (
        sum(m["accuracy"] for m in t["validation"]["byLanguage"].values())/2,
        t["validation"]["overall"]["f1"]))
    # Seed 42 stays primary regardless of the confirmation result.
    dump(REPORT / "selection.json", dict(primary=selected, trials=[t["path"] for t in trials], protocol=protocol))
    confirmation = train(selected["name"], 123, train_rows, val_rows, protocol, device)
    performance = {}
    for trial in trials:
        model = LexicalCNN(trial["spec"])
        model.load_state_dict(torch.load(Path(trial["path"]) / "best.pt", map_location="cpu", weights_only=True))
        performance[Path(trial["path"]).name] = speed(model, val_rows, 256)
    model = make_model("cross-attention")
    model.load_state_dict(torch.load(REFERENCE / "best.pt", map_location="cpu", weights_only=True))
    performance["cross-attention"] = speed(model, val_rows, 384)
    dump(REPORT / "performance.json", dict(metrics=performance, threads=8, processor=platform.processor(),
         methodology="FP32 PyTorch CPU, matched evenly spaced validation inputs per language; 1 warmup, 20 repeats, median; scoring only, excludes tokenization/rendering"))
    dump(REPORT / "complete.json", dict(primary=selected["path"], confirmation=confirmation["path"], testAccess="none"))
    print("Search complete; primary frozen. Test remains unopened.", flush=True)


if __name__ == "__main__":
    main()
