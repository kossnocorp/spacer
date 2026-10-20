"""One-shot held-out comparison of the frozen architecture and paired controls."""
import hashlib
import json
from pathlib import Path

import numpy as np
import torch
from research_v2 import Lines, make_model, load, predict, dump
from worker import device_for, measure


def main():
    root = Path("tmp/research-v2-gpu")
    data_root = Path("tmp/encoded-v2-teacher")
    output = Path("reports/research-v2/final-test.json")
    if output.exists():
        raise ValueError("Final evaluation already exists")
    selection = json.loads((root / "selection.json").read_text())
    manifest_raw = (data_root / "manifest.json").read_bytes()
    manifest_hash = hashlib.sha256(manifest_raw).hexdigest()
    reference = json.loads(Path("reports/research-v2/lines-reference-validation.json").read_text())
    if reference["encodedManifestSha256"] != manifest_hash:
        raise ValueError("Reference validation membership differs")
    plan = []
    for architecture in [selection["architecture"], "lines"]:
        for seed in [42, 123, 2026]:
            path = root / f"{architecture}-mixed-seed{seed}"
            config = json.loads((path / "config.json").read_text())
            if config["encodedManifestSha256"] != manifest_hash:
                raise ValueError("Model membership differs")
            plan.append({"name": path.name, "path": str(path), "architecture": architecture,
                         "threshold": config["validation"]["threshold"], "config": config,
                         "weightsSha256": hashlib.sha256((path / "best.pt").read_bytes()).hexdigest()})
    baseline = Path("tmp/spacer-lines-ts")
    config = json.loads((baseline / "config.json").read_text())
    weights_hash = hashlib.sha256((baseline / "best.pt").read_bytes()).hexdigest()
    if weights_hash != reference["weightsSha256"]:
        raise ValueError("Historical baseline changed")
    plan.append({"name": "historical-lines", "path": str(baseline), "architecture": "lines",
                 "threshold": config["threshold"], "accuracyThreshold": reference["accuracyCalibrated"]["threshold"],
                 "weightsSha256": weights_hash, "config": config})
    # The plan and every threshold are persisted BEFORE opening any test records.
    frozen = {"selection": selection, "encodedManifestSha256": manifest_hash, "models": plan,
              "primaryCandidate": selection["seed42Winner"], "testSelection": "none"}
    with (data_root / "TEST-OPENED-v2.json").open("x") as gate:
        json.dump(frozen, gate, indent=2)
    torch.set_num_threads(8)
    device = device_for("auto")
    data = load(data_root, "test", json.loads(manifest_raw), "mixed")
    x = torch.from_numpy(np.array(data[:, :384], dtype=np.int32)).to(device)
    labels = np.array(data[:, 384])
    results, decisions = {}, {}
    for item in plan:
        print(f"Held-out scoring: {item['name']}", flush=True)
        model = make_model(item["architecture"])
        state = torch.load(Path(item["path"]) / "best.pt", map_location="cpu", weights_only=True)
        if item["name"] == "historical-lines":
            model.base.load_state_dict(state)
        else:
            model.load_state_dict(state)
        model.to(device)
        scores = predict(model, x, 512)
        result = {"savedThreshold": measure(labels, scores, item["threshold"])}
        if "accuracyThreshold" in item:
            result["validationAccuracyThreshold"] = measure(labels, scores, item["accuracyThreshold"])
        results[item["name"]] = result
        decisions[item["name"]] = (scores >= item["threshold"]) == labels
        print(json.dumps(result), flush=True)
        dump(output, {"complete": False, "plan": frozen, "results": results})
        del model
    paired = {}
    for seed in [42, 123, 2026]:
        candidate = decisions[f"{selection['architecture']}-mixed-seed{seed}"]
        control = decisions[f"lines-mixed-seed{seed}"]
        paired[str(seed)] = {"candidateOnlyCorrect": int((candidate & ~control).sum()),
                             "linesOnlyCorrect": int((~candidate & control).sum()),
                             "accuracyDifference": float(candidate.mean()-control.mean())}
    dump(output, {"complete": True, "plan": frozen, "results": results, "paired": paired})
    rows = []
    for name, result in results.items():
        metric = result["savedThreshold"]
        rows.append(f"| {name} | {100*metric['accuracy']:.3f} | {100*metric['f1']:.3f} | {metric['logLoss']:.5f} | {metric['threshold']} |")
        if "validationAccuracyThreshold" in result:
            metric = result["validationAccuracyThreshold"]
            rows.append(f"| {name} (validation accuracy threshold) | {100*metric['accuracy']:.3f} | {100*metric['f1']:.3f} | {metric['logLoss']:.5f} | {metric['threshold']} |")
    performance = json.loads(Path("reports/research-v2/validation-gpu.json").read_text())["metrics"]
    document = "\n".join([
        "# Tree-sitter v2 results", "", f"One-shot held-out comparison on **{len(labels):,} matched teacher-labeled boundaries**.", "",
        "Architecture, seed-42 primary candidate, checkpoints and validation-calibrated thresholds were frozen before opening test records. No test-time selection or recalibration.", "",
        "| Model | Accuracy % | F1 % | Log loss | Threshold |", "| --- | ---: | ---: | ---: | ---: |", *rows, "",
        "## Performance tradeoff", "",
        f"CPU scoring: historical Lines **{performance['lines']['cpuScoringBoundariesPerSecond']:,.0f} boundaries/s**; cross-attention **{performance['candidate']['cpuScoringBoundariesPerSecond']:,.0f} boundaries/s**.", "",
        "These are PyTorch CPU measurements with 8 threads, preencoded inputs, batch 512, and three repetitions. They exclude parsing, tokenization and rendering. An accuracy improvement is not a throughput win.", "",
        "This is a lexical–Tree-sitter hybrid: BPE retains spelling/literals, while a separate compact-ID syntax stream contributes structural context. It is not an entity-only model.", "",
        "Coverage: bundled grammars rejected 1,842 source files. All models use identical admitted examples and file-group splits; results are not a full-corpus comparison. Test rows inherit historical split assignments, whose aggregate metrics have been published for earlier models.", "",
        "Raw results, frozen hashes, thresholds and paired correctness counts: `reports/research-v2/final-test.json`. Training/evaluation protocol: [tree-sitter-v2.md](tree-sitter-v2.md).", "",
    ])
    Path("docs/research/tree-sitter-v2-results.md").write_text(document)


if __name__ == "__main__":
    main()
