"""One-shot, resumable CPU evaluation of frozen bilingual Lines and controls."""
import fcntl
import json
from pathlib import Path

import numpy as np
import torch

from lines_mixed import DATA, ROOT, REPORT, REFERENCE, LexicalCNN, sha, rows_for, predict, metrics
from research_v2 import dump, make_model


def main():
    lock = (ROOT / "evaluation.lock").open("w")
    fcntl.flock(lock, fcntl.LOCK_EX)
    output = REPORT / "held-out.json"
    if output.exists() and json.loads(output.read_text()).get("complete"):
        print("Evaluation already complete; reusing saved results.")
        return
    completed = json.loads((REPORT / "complete.json").read_text())
    selection = json.loads((REPORT / "selection.json").read_text())
    protocol = selection["protocol"]
    if sha(DATA / "manifest.json") != protocol["encodedManifestSha256"]:
        raise ValueError("Dataset changed")
    plan = []
    for path in [completed["primary"], str(ROOT / "baseline-seed42"), completed["confirmation"]]:
        root = Path(path)
        config = json.loads((root / "config.json").read_text())
        if sha(root / "best.pt") != config["weightsSha256"]:
            raise ValueError("Checkpoint changed")
        plan.append(dict(name=root.name, path=path, spec=config["spec"],
                         weightsSha256=config["weightsSha256"], threshold=config["validation"]["overall"]["threshold"]))
    if plan[0]["weightsSha256"] != selection["primary"]["weightsSha256"]:
        raise ValueError("Primary differs from frozen selection")
    ref = json.loads((REFERENCE / "config.json").read_text())
    if sha(REFERENCE / "best.pt") != protocol["referenceWeightsSha256"] or ref["encodedManifestSha256"] != protocol["encodedManifestSha256"]:
        raise ValueError("Reference changed")
    plan.append(dict(name="cross-attention", path=str(REFERENCE), spec=None,
                     weightsSha256=protocol["referenceWeightsSha256"], threshold=ref["validation"]["threshold"]))
    frozen = dict(models=plan, primary=plan[0]["name"], encodedManifestSha256=protocol["encodedManifestSha256"],
                  selectionSha256=sha(REPORT / "selection.json"), implementationSha256=sha(Path(__file__)),
                  methodology="One shared validation-calibrated threshold per model; no test selection or retuning; CPU FP32")
    gate = DATA / "TEST-OPENED-lines-mixed-v1.json"
    if gate.exists():
        if json.loads(gate.read_text()) != frozen:
            raise ValueError("Frozen evaluation changed")
    else:
        with gate.open("x") as stream:
            json.dump(frozen, stream, indent=2)
    dump(REPORT / "held-out-plan.json", frozen)
    torch.set_num_threads(8)
    rows = rows_for("test", json.loads((DATA / "manifest.json").read_text()))
    results, correct = {}, {}
    for item in plan:
        cache = ROOT / f"test-scores-{item['name']}.npy"
        if cache.exists():
            scores = np.load(cache)
        else:
            model = LexicalCNN(item["spec"]) if item["spec"] else make_model("cross-attention")
            model.load_state_dict(torch.load(Path(item["path"]) / "best.pt", map_location="cpu", weights_only=True))
            print(f"Scoring {item['name']}: {len(rows):,} held-out boundaries on CPU", flush=True)
            scores = predict(model, rows, torch.device("cpu"), 256 if item["spec"] else 384)
            temporary = cache.with_suffix(".tmp")
            with temporary.open("wb") as stream:
                np.save(stream, scores)
            temporary.replace(cache)
            del model
        if len(scores) != len(rows) or not np.isfinite(scores).all():
            raise ValueError("Invalid predictions")
        results[item["name"]] = metrics(rows, scores, item["threshold"])
        correct[item["name"]] = (scores >= item["threshold"]) == rows[:, 384]
        dump(output, dict(complete=False, plan=frozen, results=results))
        print(json.dumps({item["name"]: results[item["name"]]}), flush=True)
    primary = correct[frozen["primary"]]
    paired = {}
    for name, control in correct.items():
        if name == frozen["primary"]:
            continue
        paired[name] = {}
        for language, mask in [("overall", np.ones(len(rows), dtype=bool)),
                               ("typescript", rows[:, 386] == 0), ("rust", rows[:, 386] == 1)]:
            a, b = primary[mask], control[mask]
            paired[name][language] = dict(primaryOnlyCorrect=int((a & ~b).sum()),
                                         controlOnlyCorrect=int((~a & b).sum()), accuracyDifference=float(a.mean()-b.mean()))
    dump(output, dict(complete=True, plan=frozen, results=results, paired=paired,
                     inference="CPU FP32; no confidence intervals assuming independent boundaries"))
    print("Held-out evaluation complete; no model selection or threshold changes.", flush=True)


if __name__ == "__main__":
    main()
