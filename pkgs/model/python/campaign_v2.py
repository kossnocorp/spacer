"""Sequential research campaign. Select on validation; never opens test labels."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

from research_v2 import dump


def train(architecture, language, seed, original, cpu=False, gpu_resume=False):
    out = Path(("tmp/research-v2-original" if original else "tmp/research-v2") + ("-cpu" if cpu else "-gpu" if gpu_resume else ""))
    data = "tmp/encoded-v2-original" if original else "tmp/encoded-v2-teacher"
    extra = ["--device", "cpu"] if cpu else []
    if cpu and not original and architecture == "hybrid" and seed == 42:
        extra += ["--resume-from", "tmp/research-v2/hybrid-mixed-seed42"]
    if gpu_resume and not original and architecture == "hybrid" and seed == 42:
        extra += ["--resume-from", "tmp/research-v2-cpu/hybrid-mixed-seed42"]
    subprocess.run([sys.executable, "-u", "pkgs/model/python/research_v2.py", "--architecture", architecture,
        "--language", language, "--seed", str(seed), "--data", data, "--out", str(out), "--resume", *extra], check=True)
    root = out / f"{architecture}-{language}-seed{seed}"
    return root, json.loads((root / "config.json").read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", action="store_true")
    backend = parser.add_mutually_exclusive_group()
    backend.add_argument("--cpu", action="store_true")
    backend.add_argument("--gpu-resume", action="store_true", help="Continue the CPU checkpoint on GPU in a separate lineage")
    args = parser.parse_args()
    suffix = "-cpu" if args.cpu else "-gpu" if args.gpu_resume else ""
    selection = Path(f"tmp/research-v2{suffix}/selection.json")
    if args.original:
        chosen = json.loads(selection.read_text())
        if args.gpu_resume:
            for architecture, language in [("lines", "typescript"), ("lines", "rust"), (chosen["architecture"], "mixed")]:
                subprocess.run([sys.executable, "-u", "pkgs/model/python/original_v2.py", "--architecture", architecture, "--language", language], check=True)
            return
        train("lines", "typescript", 42, True, args.cpu, args.gpu_resume)
        train("lines", "rust", 42, True, args.cpu, args.gpu_resume)
        train(chosen["architecture"], "mixed", 42, True, args.cpu, args.gpu_resume)
        return
    trials = [train(architecture, "mixed", 42, False, args.cpu, args.gpu_resume) for architecture in ["hybrid", "lines", "cross-attention", "hybrid-wide"]]
    candidates = [(root, config) for root, config in trials if config["architecture"] != "lines"]
    root, config = max(candidates, key=lambda pair: (pair[1]["validation"]["accuracy"], -pair[1]["validation"]["logLoss"]))
    dump(selection, {"architecture": config["architecture"], "seed42Winner": str(root),
                     "selection": "maximum validation accuracy, log-loss tie break; no test access",
                     "trials": [{"path": str(path), "validation": cfg["validation"]} for path, cfg in trials]})
    for seed in [123, 2026]:
        train(config["architecture"], "mixed", seed, False, args.cpu, args.gpu_resume)
        train("lines", "mixed", seed, False, args.cpu, args.gpu_resume)
    report = Path(f"reports/research-v2/validation{suffix}.json")
    if not report.exists():
        subprocess.run([sys.executable, "-u", "pkgs/model/python/evaluate_v2.py", "--model", str(root), "--out", str(report)], check=True)
    print(f"Validation campaign completed. Selection: {selection}; test remains unopened.", flush=True)


if __name__ == "__main__":
    main()
