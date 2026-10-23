"""Frozen original-spacing cross-attention campaign; no test evaluation."""
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from research_v2 import dump

ROOT = Path("tmp/spacing-context-v1")
DATA = Path("tmp/encoded-spacing-context-v1")
REPORT = Path("docs/benchmark-data/spacing-context-v1")
EXPORT = Path("tmp/spacer-tree-sitter-spacing-context-1")
CORPORA = [Path(f"corpora/github-top100-{language}-2026-10-17-v2") for language in ["typescript", "rust"]]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    print("Running:", " ".join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), check=True)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / "campaign.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        implementations = ["pkgs/model/src/encode-v2.ts", "pkgs/model/src/spacing-context.ts",
            "pkgs/model/src/tokenizer.ts", "pkgs/tree-sitter/src/index.ts", "pkgs/tree-sitter/src/worker.ts",
            "pkgs/model/python/research_v2.py", "pkgs/model/python/tune.py", "pkgs/model/python/worker.py",
            "pkgs/model/src/attention-predict.ts", "pkgs/model/src/evaluate-spacing-context.ts",
            "pkgs/model/python/export_attention.py", "pkgs/model/src/attention.test.ts",
            "pkgs/model/python/spacing_campaign.py", "docs/research/spacing-context-v1.md"]
        protocol = dict(schema=1, seed=42, architecture="cross-attention", contextMode="spacing-context-v1",
            corpus=[dict(root=str(p), sha256=sha(p / "manifest.json")) for p in CORPORA],
            implementation={p: sha(Path(p)) for p in implementations},
            targetGap="entire blank run omitted from both lexical streams; syntax row offsets not encoded",
            corruption="none", training="teacher-forced original surrounding spacing",
            inference="top-to-bottom, prior decisions + unprocessed future spacing, target gap hidden",
            selection="minimum validation log loss; global threshold maximizes validation accuracy, F1 tie-break",
            test="legacy split previously evaluated by other experiments; not opened by this campaign")
        frozen = REPORT / "protocol.json"
        if frozen.exists() and json.loads(frozen.read_text()) != protocol:
            raise ValueError("Frozen campaign implementation or corpus changed")
        dump(frozen, protocol)
        if not (DATA / "manifest.json").exists():
            if DATA.exists():
                raise ValueError("Preserve interrupted encoding directory before restarting")
            run("node", "--max-old-space-size=16384", "pkgs/model/src/encode-v2.ts", "--raw", "--spacing-context",
                "--corpus", ",".join(map(str, CORPORA)), "--out", DATA)
        if (DATA / "INCOMPLETE").exists():
            raise ValueError("Encoding incomplete")
        manifest = json.loads((DATA / "manifest.json").read_text())
        if manifest["contextMode"] != "spacing-context-v1" or manifest["corpus"] != protocol["corpus"]:
            raise ValueError("Wrong encoded corpus")
        dump(REPORT / "encoded-manifest.json", manifest)
        run(sys.executable, "-u", "pkgs/model/python/research_v2.py", "--data", DATA,
            "--out", ROOT, "--architecture", "cross-attention", "--language", "mixed",
            "--epochs", "40", "--patience", "7", "--batch-size", "512", "--seed", "42",
            "--device", "auto", "--stream-data", "--resume")
        trained = ROOT / "cross-attention-mixed-seed42"
        config = json.loads((trained / "config.json").read_text())
        dump(REPORT / "training.json", dict(config=config, history=json.loads((trained / "history.json").read_text()),
            weightsSha256=sha(trained / "best.pt")))
        if not EXPORT.exists():
            run(sys.executable, "pkgs/model/python/export_attention.py", "--root", trained,
                "--out", EXPORT, "--data", DATA, "--training-languages", "typescript", "tsx", "rust")
        run("node", "--test", "pkgs/model/src/attention.test.ts")
        if not (REPORT / "sequential-validation.json").exists():
            run("node", "pkgs/model/src/evaluate-spacing-context.ts")
        dump(REPORT / "complete.json", dict(complete=True, checkpoint=str(trained), export=str(EXPORT),
            weightsSha256=sha(trained / "best.pt"), protocolSha256=sha(frozen)))
        print("Spacing-context campaign complete", flush=True)


if __name__ == "__main__":
    main()
