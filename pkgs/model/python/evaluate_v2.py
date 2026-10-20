"""Matched evaluation against frozen Lines, with an explicit one-shot test gate."""
import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import torch
from research_v2 import Lines, make_model, load, predict, dump
from worker import measure


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("tmp/encoded-v2-teacher"))
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, default=Path("tmp/spacer-lines-ts"))
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args()
    config = json.loads((args.model / "config.json").read_text())
    baseline_config = json.loads((args.baseline / "config.json").read_text())
    raw = (args.data / "manifest.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != config["encodedManifestSha256"]:
        raise ValueError("Model and evaluation dataset do not match")
    if args.out.exists():
        raise ValueError("Evaluation output exists; preserve previous evaluations")
    if args.test:
        # Freeze paths, weights and thresholds before accessing any test labels.
        with (args.data / "TEST-OPENED-v2.json").open("x") as gate:
            json.dump({"model": str(args.model), "baseline": str(args.baseline), "modelConfig": config,
                "baselineConfig": baseline_config, "weightsSha256": hashlib.sha256((args.model / "best.pt").read_bytes()).hexdigest()}, gate, indent=2)
    manifest = json.loads(raw)
    split = "test" if args.test else "eval"
    data = load(args.data, split, manifest, config["language"])
    x = torch.from_numpy(np.array(data[:, :384], dtype=np.int32))
    labels = np.asarray(data[:, 384])
    torch.set_num_threads(8)
    model = make_model(config["architecture"])
    model.load_state_dict(torch.load(args.model / "best.pt", map_location="cpu", weights_only=True))
    baseline = Lines()
    state = torch.load(args.baseline / "best.pt", map_location="cpu", weights_only=True)
    (baseline if "base.embedding.weight" in state else baseline.base).load_state_dict(state)
    results, decisions = {}, {}
    for name, network, threshold in [("lines", baseline, baseline_config.get("threshold", baseline_config["validation"]["threshold"])),
                                      ("candidate", model, config["validation"]["threshold"])]:
        print(f"Scoring {name} on {len(x)} {split} rows", flush=True)
        scores = predict(network, x, 512)
        results[name] = {"savedThreshold": measure(labels, scores, threshold), "parameters": sum(p.numel() for p in network.parameters())}
        if not args.test:
            results[name]["accuracyCalibratedValidation"] = max((measure(labels, scores, t/1000) for t in range(100, 901, 5)), key=lambda m: (m["accuracy"], m["f1"]))
        decisions[name] = (scores >= threshold) == labels
        # Fixed first 8192 validation inputs, three repetitions; tokens already encoded.
        speed_x = x[:8192]
        predict(network, speed_x[:512], 512)
        times = []
        for _ in range(3):
            begin = time.perf_counter()
            predict(network, speed_x, 512)
            times.append(time.perf_counter() - begin)
        results[name]["cpuScoringBoundariesPerSecond"] = len(speed_x) / float(np.median(times))
        results[name]["timingSeconds"] = times
        print(json.dumps(results[name]), flush=True)
    dump(args.out, {"split": split, "data": str(args.data), "candidate": str(args.model), "baseline": str(args.baseline),
                   "metrics": results, "candidateOnlyCorrect": int((decisions["candidate"] & ~decisions["lines"]).sum()),
                   "linesOnlyCorrect": int((~decisions["candidate"] & decisions["lines"]).sum()),
                   "timingScope": "PyTorch CPU scoring, 8 threads, preencoded tokens, batch 512; excludes parsing/tokenization/rendering"})


if __name__ == "__main__":
    main()
