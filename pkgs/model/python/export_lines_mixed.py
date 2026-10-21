"""Export the frozen bilingual primary with training-only parity fixtures."""
import json
from pathlib import Path

import numpy as np
import torch

from lines_mixed import DATA, REPORT, LexicalCNN, sha, rows_for
from research_v2 import dump
from tune import export


def main():
    selected = json.loads((REPORT / "selection.json").read_text())["primary"]
    root = Path(selected["path"])
    if sha(root / "best.pt") != selected["weightsSha256"]:
        raise ValueError("Frozen checkpoint changed")
    out = Path("tmp/spacer-lines-mixed-1")
    if out.exists():
        raise ValueError("Export already exists; preserve the existing release")
    out.mkdir()
    (out / "INCOMPLETE").touch()
    torch.set_num_threads(8)
    model = LexicalCNN(selected["spec"]).eval()
    model.load_state_dict(torch.load(root / "best.pt", map_location="cpu", weights_only=True))
    manifest = json.loads((DATA / "manifest.json").read_text())
    rows = rows_for("train", manifest)
    indices = np.linspace(0, len(rows)-1, 128, dtype=np.int64)
    tokens = np.array(rows[indices, :256], dtype=np.int32)
    export(model.base, out, torch.from_numpy(tokens))
    dump(out / "config.json", dict(schema=1, trainer="PyTorch/ROCm", modelName="spacer-lines-mixed-1",
         context=5, tokensPerSide=128, tokenizer=manifest["lexicalTokenizer"],
         architecture=selected["spec"], seed=42, parameters=selected["parameters"],
         threshold=selected["validation"]["overall"]["threshold"], validation=selected["validation"],
         sourceCheckpoint=str(root), sourceWeightsSha256=selected["weightsSha256"],
         encodedManifestSha256=sha(DATA / "manifest.json"), trainingLanguages=["typescript", "tsx", "rust"],
         labelSource="original upstream spacing", checkpointSelection="minimum validation log loss",
         thresholdSelection="maximum validation accuracy; F1 tie break; one global threshold"))
    print(f"Exported tensors and parity fixture to {out}; run rocm.ts export next.")


if __name__ == "__main__":
    main()
