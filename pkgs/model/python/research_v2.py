"""Matched from-scratch lexical/structural training; validation only during search."""
import argparse
import fcntl
import hashlib
import json
import random
import shutil
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from worker import BoundaryCNN, device_for, measure
from tune import ContextCNN, BASE


class Hybrid(nn.Module):
    """Preserve BPE spelling/literals and add independent syntax/identity context.

    Neither stream sees blank lines. Near-boundary order and contextual features
    are retained instead of reducing the entire AST to pooled bags of entities.
    """
    def __init__(self, wide=False):
        super().__init__()
        width = 64 if wide else 32
        self.lexical = ContextCNN(100278, dict(embedding=width, channels=width, hidden=128,
            dilations=[1, 2], nearest=16, contextualNearest=16, dropout=.3), "expanded")
        self.structural = ContextCNN(512, dict(embedding=16, channels=32, hidden=64,
            dilations=[1, 2], nearest=16, contextualNearest=16, dropout=.3), "expanded")
        lexical_size = self.lexical.hidden.in_features
        structural_size = self.structural.hidden.in_features
        # These encoders expose their feature maps; remove unused classifiers.
        del self.lexical.hidden, self.lexical.output, self.structural.hidden, self.structural.output
        self.head = nn.Sequential(nn.Linear(lexical_size + structural_size, 128), nn.ReLU(),
                                  nn.Dropout(.3), nn.Linear(128, 1))

    def forward(self, x):
        features = self.lexical.side(x[:, :128], True) + self.lexical.side(x[:, 128:256], False)
        features += self.structural.side(x[:, 256:320], True) + self.structural.side(x[:, 320:384], False)
        return self.head(torch.cat(features, 1)).squeeze(1)


class Lines(nn.Module):
    def __init__(self):
        super().__init__()
        self.base = BoundaryCNN()

    def forward(self, x):
        return self.base(x[:, :256])


class CrossAttention(nn.Module):
    """Small latent-query attention: cross-stream interaction without quadratic
    self-attention over hundreds of source tokens. Retain ordered local features.
    """
    def __init__(self):
        super().__init__()
        self.lexical = nn.Embedding(100278, 32, padding_idx=0)
        self.structural = nn.Embedding(512, 32, padding_idx=0)
        self.positions = nn.Parameter(torch.randn(1, 384, 64) * .02)
        self.project = nn.Linear(32, 64)
        self.queries = nn.Parameter(torch.randn(1, 8, 64) * .02)
        self.attention = nn.MultiheadAttention(64, 4, dropout=.1, batch_first=True)
        self.norm = nn.LayerNorm(64)
        self.feedforward = nn.Sequential(nn.Linear(64, 128), nn.GELU(), nn.Dropout(.2), nn.Linear(128, 64))
        self.head = nn.Sequential(nn.Linear(8*64 + 64*32, 128), nn.ReLU(), nn.Dropout(.3), nn.Linear(128, 1))

    def forward(self, x):
        lexical = self.lexical(x[:, :256])
        structural = self.structural(x[:, 256:384])
        tokens = torch.cat([lexical, structural], 1)
        memory = self.project(tokens) + self.positions
        queries = self.queries.expand(len(x), -1, -1)
        attended, _ = self.attention(queries, memory, memory, key_padding_mask=x.eq(0), need_weights=False)
        features = self.norm(queries + attended)
        features = features + self.feedforward(features)
        near = torch.cat([lexical[:, 112:144], structural[:, 48:80]], 1)
        return self.head(torch.cat([features.flatten(1), near.flatten(1)], 1)).squeeze(1)


def make_model(architecture):
    if architecture == "lines":
        return Lines()
    if architecture == "cross-attention":
        return CrossAttention()
    return Hybrid(architecture == "hybrid-wide")


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n")
    temporary.replace(path)


def load(root, split, manifest, language):
    n = manifest["splits"][split]["count"]
    width = manifest["recordU32"]
    if (root / f"{split}.bin").stat().st_size != n * width * 4:
        raise ValueError("Invalid dataset binary size")
    data = np.memmap(root / f"{split}.bin", dtype="<u4", mode="r", shape=(n, width))
    if language != "mixed":
        data = data[data[:, 386] == (1 if language == "rust" else 0)]
    return data


@torch.inference_mode()
def predict(model, x, batch):
    model.eval()
    device = next(model.parameters()).device
    return np.concatenate([model(x[i:i+batch].to(device)).sigmoid().cpu().numpy() for i in range(0, len(x), batch)])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("tmp/encoded-v2-teacher"))
    parser.add_argument("--out", type=Path, default=Path("tmp/research-v2"))
    parser.add_argument("--architecture", choices=["lines", "hybrid", "hybrid-wide", "cross-attention"], default="hybrid")
    parser.add_argument("--language", choices=["mixed", "typescript", "rust"], default="mixed")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--patience", type=int, default=7)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--resume-from", type=Path, help="Continue a preserved checkpoint into a new run directory")
    args = parser.parse_args()
    if min(args.epochs, args.patience, args.batch_size) < 1:
        parser.error("Epochs, patience and batch size must be positive")
    lock = Path("tmp/research-v2-GPU.lock").open("w")
    print("Acquiring exclusive research GPU lock", flush=True)
    fcntl.flock(lock, fcntl.LOCK_EX)
    if (args.data / "INCOMPLETE").exists():
        raise ValueError("Incomplete encoded corpus")
    raw = (args.data / "manifest.json").read_bytes()
    manifest = json.loads(raw)
    root = args.out / f"{args.architecture}-{args.language}-seed{args.seed}"
    settings = {**vars(args), "data": str(args.data), "out": str(args.out),
                "resume_from": str(args.resume_from) if args.resume_from else None,
                "encodedManifestSha256": hashlib.sha256(raw).hexdigest(),
                "implementationSha256": hashlib.sha256(b"".join((Path(__file__).parent / file).read_bytes()
                    for file in ["research_v2.py", "worker.py", "tune.py"])).hexdigest()}
    settings.pop("resume")
    if root.exists():
        if not args.resume or json.loads((root / "run.json").read_text()) != settings:
            raise ValueError(f"Existing or incompatible run: {root}")
        if (root / "config.json").exists():
            print(f"Already complete: {root}", flush=True)
            return
    else:
        root.mkdir(parents=True)
        dump(root / "run.json", settings)
        if args.resume_from:
            previous = json.loads((args.resume_from / "run.json").read_text())
            for key in ["architecture", "language", "seed", "batch_size", "encodedManifestSha256"]:
                if previous[key] != settings[key]:
                    raise ValueError(f"Incompatible continuation: {key}")
            for file in ["last.pt", "best.pt", "validation-scores.npy", "history.json"]:
                shutil.copy2(args.resume_from / file, root / file)
            dump(root / "continuation.json", {"source": str(args.resume_from), "sourceSettings": previous,
                "checkpointSha256": hashlib.sha256((root / "last.pt").read_bytes()).hexdigest(),
                "reason": "Explicit backend continuation; CPU/GPU dropout streams are not bit-identical"})
    (root / "INCOMPLETE").touch()
    torch.set_num_threads(8)
    torch.manual_seed(args.seed)
    random.seed(args.seed)
    np.random.seed(args.seed)
    device = torch.device("cpu") if args.device == "cpu" else device_for(args.device)
    print("Loading train and validation only; test remains unopened", flush=True)
    arrays = [load(args.data, split, manifest, args.language) for split in ["train", "eval"]]
    # int32 embedding indices halve corpus VRAM. Keep tensors resident to avoid
    # millions of tiny host transfers and shuffled disk reads every epoch.
    required = sum(len(a) * 384 * 4 for a in arrays)
    free = torch.cuda.mem_get_info(device)[0] if device.type == "cuda" else 0
    storage = device if device.type == "cuda" and required < free * .65 else torch.device("cpu")
    print(f"Input tensor storage: {storage}; {required / 2**30:.2f} GiB", flush=True)
    train_x, val_x = [torch.from_numpy(np.array(a[:, :384], dtype=np.int32)).to(storage) for a in arrays]
    train_y = torch.from_numpy(np.array(arrays[0][:, 384], dtype=np.float32)).to(storage)
    val_y = np.array(arrays[1][:, 384], dtype=np.float32)
    val_language = np.array(arrays[1][:, 386])
    model = make_model(args.architecture).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.001, foreach=False)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=.5, patience=2, min_lr=1e-5)
    loss_fn = nn.BCEWithLogitsLoss()
    history, best, stale, first = [], float("inf"), 0, 1
    if (root / "last.pt").exists():
        checkpoint = torch.load(root / "last.pt", map_location="cpu", weights_only=False)
        model.load_state_dict(checkpoint["model"])
        optimizer.load_state_dict(checkpoint["optimizer"])
        scheduler.load_state_dict(checkpoint["scheduler"])
        torch.set_rng_state(checkpoint["rng"])
        if device.type == "cuda" and checkpoint.get("gpuRng") is not None:
            torch.cuda.set_rng_state(checkpoint["gpuRng"], device)
        history, best, stale = checkpoint["history"], checkpoint["best"], checkpoint["stale"]
        first = len(history) + 1
    started = time.monotonic()
    print(json.dumps({"run": str(root), "parameters": sum(p.numel() for p in model.parameters()),
        "train": len(train_x), "eval": len(val_x), "allocatedGiB": torch.cuda.memory_allocated() / 2**30 if device.type == "cuda" else 0}), flush=True)
    for epoch in range(first, args.epochs + 1):
        model.train()
        order = torch.from_numpy(np.random.default_rng(args.seed + epoch).permutation(len(train_x))).to(storage)
        begin = last = time.monotonic()
        total, seen = 0., 0
        for start in range(0, len(order), args.batch_size):
            idx = order[start:start+args.batch_size]
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(train_x[idx].to(device)), train_y[idx].to(device))
            if not torch.isfinite(loss):
                raise ValueError("Nonfinite training loss")
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.)
            optimizer.step()
            total += loss.detach().item() * len(idx)
            seen += len(idx)
            now = time.monotonic()
            if now - last > 10:
                event = {"epoch": epoch, "seen": seen, "total": len(order), "loss": total / seen,
                         "samplesPerSecond": seen / (now-begin), "etaSeconds": (len(order)-seen)*(now-begin)/seen}
                print(json.dumps(event), flush=True)
                with (root / "progress.jsonl").open("a") as output:
                    output.write(json.dumps(event) + "\n")
                last = now
        scores = predict(model, val_x, args.batch_size)
        evaluation = measure(val_y, scores)
        history.append({"epoch": epoch, "trainingLoss": total/seen, "validation": evaluation, "seconds": time.monotonic()-begin})
        print(json.dumps(history[-1]), flush=True)
        if evaluation["logLoss"] < best - .0001:
            best, stale = evaluation["logLoss"], 0
            torch.save(model.state_dict(), root / "best.pt")
            np.save(root / "validation-scores.npy", scores)
        else:
            stale += 1
        scheduler.step(evaluation["logLoss"])
        dump(root / "history.json", history)
        torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(), "scheduler": scheduler.state_dict(),
                    "history": history, "best": best, "stale": stale, "rng": torch.get_rng_state(), "gpuRng": torch.cuda.get_rng_state(device) if device.type == "cuda" else None}, root / "last.pt.tmp")
        (root / "last.pt.tmp").replace(root / "last.pt")
        if stale >= args.patience:
            break
    scores = np.load(root / "validation-scores.npy")
    # Accuracy is the predeclared win criterion, F1 and log-loss are reported too.
    selected = max((measure(val_y, scores, t/1000) for t in range(100, 901, 5)), key=lambda m: (m["accuracy"], m["f1"]))
    by_language = {name: measure(val_y[val_language == code], scores[val_language == code], selected["threshold"])
                   for name, code in [("typescript", 0), ("rust", 1)] if (val_language == code).any()}
    dump(root / "config.json", {**settings, "parameters": sum(p.numel() for p in model.parameters()),
         "validation": selected, "byLanguage": by_language, "checkpointSelection": "minimum validation log loss",
         "thresholdSelection": "maximum validation accuracy, F1 tie break", "elapsedSeconds": time.monotonic()-started,
         "torch": torch.__version__, "device": torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU"})
    (root / "INCOMPLETE").unlink()
    print(json.dumps(selected), flush=True)


if __name__ == "__main__":
    main()
