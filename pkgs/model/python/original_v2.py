"""GPU training on the full original corpus with bounded-memory batch loading."""
import argparse
import fcntl
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import torch
from research_v2 import make_model, dump
from worker import device_for, measure


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--architecture", choices=["lines", "cross-attention"], required=True)
    parser.add_argument("--language", choices=["typescript", "rust", "mixed"], required=True)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    lock = Path("tmp/research-v2-GPU.lock").open("w")
    fcntl.flock(lock, fcntl.LOCK_EX)
    torch.set_num_threads(8)
    torch.manual_seed(args.seed)
    device = device_for("auto")
    data_root = Path("tmp/encoded-v2-original")
    if (data_root / "INCOMPLETE").exists():
        raise ValueError("Incomplete dataset")
    raw = (data_root / "manifest.json").read_bytes()
    manifest = json.loads(raw)
    root = Path("tmp/research-v2-original-gpu") / f"{args.architecture}-{args.language}-seed{args.seed}"
    settings = {**vars(args), "encodedManifestSha256": hashlib.sha256(raw).hexdigest(),
        "implementationSha256": hashlib.sha256(Path(__file__).read_bytes() + Path("pkgs/model/python/research_v2.py").read_bytes()).hexdigest(),
        "batchSize": 512, "inputStorage": "read-only memory-mapped files; batch transfer to GPU", "data": str(data_root)}
    if root.exists():
        if json.loads((root / "run.json").read_text()) != settings:
            raise ValueError("Run configuration changed")
        if (root / "config.json").exists():
            print(f"Already complete: {root}", flush=True)
            return
    else:
        root.mkdir(parents=True)
        dump(root / "run.json", settings)
    (root / "INCOMPLETE").touch()
    arrays, indices = [], []
    for split in ["train", "eval"]:
        count = manifest["splits"][split]["count"]
        path = data_root / f"{split}.bin"
        if path.stat().st_size != count * 387 * 4:
            raise ValueError(f"Wrong binary length: {split}")
        rows = np.memmap(path, dtype="<u4", mode="r", shape=(count, 387))
        arrays.append(rows)
        idx = np.arange(count, dtype=np.int64) if args.language == "mixed" else np.flatnonzero(rows[:, 386] == (args.language == "rust"))
        if not len(idx):
            raise ValueError("Empty language split")
        indices.append(idx)
    val_y = np.array(arrays[1][indices[1], 384], dtype=np.float32)
    val_language = np.array(arrays[1][indices[1], 386], dtype=np.uint8)
    model = make_model(args.architecture).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.001, foreach=False)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=.5, patience=2, min_lr=1e-5)
    history, best, stale, first = [], float("inf"), 0, 1
    if (root / "last.pt").exists():
        checkpoint = torch.load(root / "last.pt", map_location="cpu", weights_only=False)
        model.load_state_dict(checkpoint["model"])
        optimizer.load_state_dict(checkpoint["optimizer"])
        scheduler.load_state_dict(checkpoint["scheduler"])
        torch.set_rng_state(checkpoint["rng"])
        torch.cuda.set_rng_state(checkpoint["gpuRng"], device)
        history, best, stale = checkpoint["history"], checkpoint["best"], checkpoint["stale"]
        first = len(history) + 1
    print(json.dumps({"run": str(root), "train": len(indices[0]), "eval": len(indices[1]),
        "parameters": sum(p.numel() for p in model.parameters()), "testAccess": "none"}), flush=True)
    for epoch in range(first, args.epochs + 1):
        model.train()
        order = np.random.default_rng(args.seed + epoch).permutation(indices[0])
        begin = last = time.monotonic()
        total, seen = 0., 0
        for start in range(0, len(order), 512):
            rows = arrays[0][order[start:start+512]]
            x = torch.from_numpy(np.array(rows[:, :384], dtype=np.int32)).to(device)
            y = torch.from_numpy(np.array(rows[:, 384], dtype=np.float32)).to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = torch.nn.functional.binary_cross_entropy_with_logits(model(x), y)
            if not torch.isfinite(loss):
                raise ValueError("Nonfinite loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
            optimizer.step()
            total += loss.detach().item() * len(rows)
            seen += len(rows)
            now = time.monotonic()
            if now-last > 10:
                event = {"epoch": epoch, "seen": seen, "total": len(order), "loss": total/seen,
                    "samplesPerSecond": seen/(now-begin), "etaSeconds": (len(order)-seen)*(now-begin)/seen}
                print(json.dumps(event), flush=True)
                with (root / "progress.jsonl").open("a") as output:
                    output.write(json.dumps(event) + "\n")
                last = now
        model.eval()
        scores = np.empty(len(indices[1]), dtype=np.float32)
        with torch.inference_mode():
            for start in range(0, len(scores), 512):
                rows = arrays[1][indices[1][start:start+512], :384]
                x = torch.from_numpy(np.array(rows, dtype=np.int32)).to(device)
                scores[start:start+len(rows)] = model(x).sigmoid().cpu().numpy()
        evaluation = measure(val_y, scores)
        history.append({"epoch": epoch, "trainingLoss": total/seen, "validation": evaluation, "seconds": time.monotonic()-begin})
        print(json.dumps(history[-1]), flush=True)
        if evaluation["logLoss"] < best-.0001:
            best, stale = evaluation["logLoss"], 0
            torch.save(model.state_dict(), root / "best.pt")
            np.save(root / "validation-scores.npy", scores)
        else:
            stale += 1
        scheduler.step(evaluation["logLoss"])
        dump(root / "history.json", history)
        torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(), "scheduler": scheduler.state_dict(),
            "history": history, "best": best, "stale": stale, "rng": torch.get_rng_state(), "gpuRng": torch.cuda.get_rng_state(device)}, root / "last.pt.tmp")
        (root / "last.pt.tmp").replace(root / "last.pt")
        if stale >= 7:
            break
    scores = np.load(root / "validation-scores.npy")
    selected = max((measure(val_y, scores, t/1000) for t in range(100, 901, 5)), key=lambda m: (m["accuracy"], m["f1"]))
    by_language = {name: measure(val_y[val_language == code], scores[val_language == code], selected["threshold"])
        for name, code in [("typescript", 0), ("rust", 1)] if (val_language == code).any()}
    dump(root / "config.json", {**settings, "parameters": sum(p.numel() for p in model.parameters()), "validation": selected,
        "byLanguage": by_language, "checkpointSelection": "minimum validation log loss", "thresholdSelection": "maximum validation accuracy; F1 tie break",
        "device": torch.cuda.get_device_name(device), "torch": torch.__version__})
    (root / "INCOMPLETE").unlink()


if __name__ == "__main__":
    main()
