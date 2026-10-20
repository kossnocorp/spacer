"""Read durable research progress without loading ML runtimes or test data."""
import json
from pathlib import Path


for directory in [Path("tmp/research-v2"), Path("tmp/research-v2-cpu"), Path("tmp/research-v2-gpu"), Path("tmp/research-v2-original"), Path("tmp/research-v2-original-cpu"), Path("tmp/research-v2-original-gpu")]:
    print(f"\n{directory}")
    print(f"{'Run':46} {'State':10} {'Epoch':>5} {'Val loss':>9} {'Accuracy':>9} {'F1':>9}")
    for run in sorted(directory.glob("*/run.json")):
        root = run.parent
        config = root / "config.json"
        history = json.loads((root / "history.json").read_text()) if (root / "history.json").exists() else []
        if config.exists():
            result = json.loads(config.read_text())["validation"]
            state = "complete"
        elif history:
            result = history[-1]["validation"]
            state = "training"
        else:
            result = None
            state = "starting"
        if (root / "INTERRUPTED").exists():
            state = "interrupted"
        metrics = f"{result['logLoss']:9.5f} {100*result['accuracy']:8.2f}% {100*result['f1']:8.2f}%" if result else "pending first validation"
        print(f"{root.name:46} {state:10} {len(history):5} {metrics}")
        progress = root / "progress.jsonl"
        if state != "complete" and progress.exists():
            for line in reversed(progress.read_text().splitlines()):
                try:
                    event = json.loads(line)
                    print(f"  epoch {event['epoch']}: {event['seen']:,}/{event['total']:,}; "
                          f"{event['samplesPerSecond']:,.0f} samples/s; epoch training ETA {event['etaSeconds']/60:.1f} min")
                    break
                except json.JSONDecodeError:
                    continue
print("\nIn-progress metrics use threshold 0.5; completed metrics use validation-calibrated thresholds.")
