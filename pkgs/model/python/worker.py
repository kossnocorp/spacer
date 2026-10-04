"""ROCm training worker. Corpus, tokenization, and the public CLI live in TS."""
import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn


class BoundaryCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.embedding = nn.Embedding(100278, 24)
        self.conv = nn.Conv1d(24, 32, 3, padding=1)
        self.hidden = nn.Linear(896, 64)
        self.dropout = nn.Dropout(0.15)
        self.output = nn.Linear(64, 1)
        nn.init.uniform_(self.embedding.weight, -0.05, 0.05)
        for layer in (self.conv, self.hidden, self.output):
            nn.init.xavier_uniform_(layer.weight)
            nn.init.zeros_(layer.bias)

    def side(self, tokens, left):
        embedded = self.embedding(tokens)
        patterns = self.conv(embedded.transpose(1, 2)).relu()
        near = embedded[:, -16:] if left else embedded[:, :16]
        return [patterns.amax(dim=2), patterns.mean(dim=2), near.flatten(1)]

    def forward(self, tokens):
        length = tokens.shape[1] // 2
        features = torch.cat(self.side(tokens[:, :length], True) + self.side(tokens[:, length:], False), dim=1)
        return self.output(self.dropout(self.hidden(features).relu())).squeeze(1)


def device_for(requested):
    if not torch.version.hip:
        raise RuntimeError("Install the ROCm PyTorch build, not a CUDA or CPU wheel")
    if not torch.cuda.is_available():
        raise RuntimeError("ROCm cannot access a GPU; check rocminfo and /dev/kfd permissions")
    properties = [torch.cuda.get_device_properties(i) for i in range(torch.cuda.device_count())]
    devices = [{"name": p.name, "architecture": p.gcnArchName, "vramGiB": p.total_memory / 2**30} for p in properties]
    if requested == "auto":
        matches = [i for i, device in enumerate(devices) if "7900 XTX" in device["name"] or device["architecture"].split(":")[0] == "gfx1100"]
        if not matches:
            raise RuntimeError(f"Select --device INDEX explicitly from {devices}")
        index = matches[0]
    else:
        index = int(requested)
    torch.cuda.set_device(index)
    print(json.dumps({"torch": torch.__version__, "hip": torch.version.hip, "device": index, "selected": devices[index], "devices": devices}), flush=True)
    return torch.device(f"cuda:{index}")  # PyTorch uses the cuda namespace for HIP too.


def measure(labels, scores, threshold=0.5):
    yes, actual = scores >= threshold, labels == 1
    tp = int((yes & actual).sum())
    fp = int((yes & ~actual).sum())
    fn = int((~yes & actual).sum())
    tn = int((~yes & ~actual).sum())
    clipped = np.clip(scores.astype(np.float64), 1e-7, 1 - 1e-7)
    return {"examples": len(labels), "threshold": float(threshold), "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "accuracy": (tp + tn) / len(labels), "precision": tp / max(tp + fp, 1),
            "recall": tp / max(tp + fn, 1), "f1": 2 * tp / max(2 * tp + fp + fn, 1),
            "logLoss": float(-(labels * np.log(clipped) + (1 - labels) * np.log(1 - clipped)).mean())}


def data_for(root, split, manifest):
    rows = manifest["splits"][split]["count"]
    width = manifest["tokensPerSide"] * 2 + 2
    path = root / f"{split}.bin"
    if path.stat().st_size != rows * width * 4:
        raise RuntimeError(f"Invalid {split} binary length")
    return np.memmap(path, dtype="<u4", mode="r", shape=(rows, width))


def batch(rows, device):
    x = torch.from_numpy(np.array(rows[:, :-2], dtype=np.int64)).to(device)
    y = torch.from_numpy(np.array(rows[:, -2], dtype=np.float32)).to(device)
    return x, y


@torch.inference_mode()
def predict(model, data, device, batch_size):
    model.eval()
    scores = np.empty(len(data), dtype=np.float32)
    for start in range(0, len(data), batch_size):
        x, _ = batch(data[start:start + batch_size], device)
        scores[start:start + len(x)] = model(x).sigmoid().cpu().numpy()
    return scores


def export_weights(model, out):
    arrays = [
        ("bpe_embedding/embeddings", model.embedding.weight),
        ("shared_patterns/kernel", model.conv.weight.permute(2, 1, 0)),
        ("shared_patterns/bias", model.conv.bias),
        ("hidden/kernel", model.hidden.weight.T),
        ("hidden/bias", model.hidden.bias),
        ("blank_line_probability/kernel", model.output.weight.T),
        ("blank_line_probability/bias", model.output.bias),
    ]
    specs = []
    with (out / "export.bin").open("wb") as stream:
        for name, tensor in arrays:
            values = tensor.detach().cpu().contiguous().numpy().astype("<f4")
            specs.append({"name": name, "shape": list(values.shape)})
            stream.write(values.tobytes())
    (out / "export.json").write_text(json.dumps(specs, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["smoke", "train"])
    parser.add_argument("--device", default="auto")
    parser.add_argument("--data", type=Path, default=Path("tmp/model-encoded"))
    parser.add_argument("--out", type=Path, default=Path("tmp/model-rocm"))
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--patience", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if min(args.epochs, args.batch_size, args.patience, args.seed) < 1:
        raise ValueError("epochs, batch size, patience, seed must be positive")
    torch.set_num_threads(8)
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = device_for(args.device)
    model = BoundaryCNN().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    loss_fn = nn.BCEWithLogitsLoss()
    if args.command == "smoke":
        x = torch.randint(1, 100000, (32, 256), device=device)
        y = torch.randint(0, 2, (32,), device=device).float()
        before = model.output.weight.detach().clone()
        losses = []
        for _ in range(3):
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(x), y)
            loss.backward()
            if not torch.isfinite(model.embedding.weight.grad).all():
                raise RuntimeError("Non-finite embedding gradients")
            optimizer.step()
            losses.append(float(loss.detach()))
        torch.cuda.synchronize()
        if torch.equal(before, model.output.weight):
            raise RuntimeError("Optimizer did not update parameters")
        print(json.dumps({"backwardPass": "passed", "optimizerUpdates": "passed", "losses": losses, "allocatedMiB": torch.cuda.max_memory_allocated() / 2**20}), flush=True)
        return

    raw_manifest = (args.data / "manifest.json").read_bytes()
    manifest = json.loads(raw_manifest)
    train = data_for(args.data, "train", manifest)
    validation = data_for(args.data, "eval", manifest)  # Never opens the test set.
    args.out.mkdir(parents=True, exist_ok=False)
    (args.out / "INCOMPLETE").write_text("ROCm training in progress\n")
    history, best_loss, best_epoch, stale = [], float("inf"), 0, 0
    started = time.monotonic()
    for epoch in range(1, args.epochs + 1):
        model.train()
        begin = time.monotonic()
        order = np.random.default_rng(args.seed + epoch).permutation(len(train))
        loss_sum, seen = 0.0, 0
        for start in range(0, len(train), args.batch_size):
            x, y = batch(train[order[start:start + args.batch_size]], device)
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(x), y)
            if not torch.isfinite(loss):
                raise RuntimeError("Non-finite loss")
            loss.backward()
            optimizer.step()
            loss_sum += float(loss.detach()) * len(x)
            seen += len(x)
            if start // args.batch_size % 200 == 0:
                print(f"epoch {epoch}: {seen}/{len(train)}, loss {loss_sum / seen:.4f}, {time.monotonic() - begin:.1f}s", flush=True)
        scores = predict(model, validation, device, args.batch_size)
        evaluation = measure(np.asarray(validation[:, -2]), scores)
        history.append({"epoch": epoch, "trainingLoss": loss_sum / seen, "evaluation": evaluation, "elapsedMs": (time.monotonic() - begin) * 1000})
        print(json.dumps(history[-1]), flush=True)
        if evaluation["logLoss"] < best_loss - 0.0001:
            best_loss, best_epoch, stale = evaluation["logLoss"], epoch, 0
            torch.save(model.state_dict(), args.out / "best.pt")
        else:
            stale += 1
        (args.out / "history.json").write_text(json.dumps(history, indent=2))
        if stale >= args.patience:
            break
    model.load_state_dict(torch.load(args.out / "best.pt", map_location=device, weights_only=True))
    scores = predict(model, validation, device, args.batch_size)
    labels = np.asarray(validation[:, -2])
    chosen = measure(labels, scores)
    for t in range(5, 96):
        candidate = measure(labels, scores, t / 100)
        if candidate["f1"] > chosen["f1"] + 1e-8:
            chosen = candidate
    export_weights(model, args.out)
    parity_rows = np.array(train[:8, :-2], dtype=np.int64)
    with torch.inference_mode():
        parity_scores = model(torch.from_numpy(parity_rows).to(device)).sigmoid().cpu().tolist()
    (args.out / "parity.json").write_text(json.dumps({"tokens": parity_rows.tolist(), "scores": parity_scores}))
    config = {"schema": 1, "trainer": "PyTorch/ROCm", "torch": torch.__version__, "hip": torch.version.hip,
              "device": torch.cuda.get_device_name(device), "context": manifest["corpus"]["context"],
              "tokensPerSide": manifest["tokensPerSide"], "tokenizer": manifest["tokenizer"],
              "threshold": chosen["threshold"], "validation": chosen, "bestEpoch": best_epoch,
              "epochsCompleted": len(history), "parameters": sum(p.numel() for p in model.parameters()),
              "seed": args.seed, "batchSize": args.batch_size,
              "checkpointSelection": "minimum validation log loss", "thresholdSelection": "maximum validation F1",
              "encodedManifestHash": hashlib.sha256(raw_manifest).hexdigest(), "corpusManifestHash": manifest["corpusManifestHash"],
              "elapsedMs": (time.monotonic() - started) * 1000}
    (args.out / "config.json").write_text(json.dumps(config, indent=2))
    print(json.dumps(config, indent=2), flush=True)


if __name__ == "__main__":
    main()
