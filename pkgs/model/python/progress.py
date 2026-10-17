"""Readable terminal progress plus durable machine-readable training telemetry."""
import json
import os
import threading
import time
from pathlib import Path


def render(row, color=True):
    """Append-only blocks work in a terminal and with tail -F (no cursor control)."""
    def style(text, code):
        return f"\033[{code}m{text}\033[0m" if color else str(text)

    def number(key, digits=4):
        value = row.get(key)
        return f"{value:,.{digits}f}" if isinstance(value, (int, float)) else "—"

    def duration(key):
        value = row.get(key)
        if not isinstance(value, (int, float)):
            return "—"
        seconds = max(0, round(value))
        minutes, seconds = divmod(seconds, 60)
        hours, minutes = divmod(minutes, 60)
        return f"{hours}h {minutes:02d}m {seconds:02d}s" if hours else f"{minutes}m {seconds:02d}s"

    event, phase = row["event"], row.get("phase", "")
    run = row.get("run", "search")
    epoch = f" · epoch {row['epoch']}" if "epoch" in row else ""
    stamp = style(f"  {row['timestamp']} · {run}{epoch}", "2")
    bullet = lambda text: f"  • {text}"
    if event == "phase":
        if phase == "train":
            title = f"EPOCH {row['epoch']} / {row.get('maxEpochs', '—')}  ·  TRAIN"
            details = f"{run} · {number('batches', 0)} batches · LR {row.get('learningRate', '—')}"
        else:
            title = phase.replace("-", " ").upper()
            details = run + epoch
        lines = ["", style("━" * 64, "36"), style(f"  {title}", "1;36"),
                 style(f"  {details}", "2"), style("━" * 64, "36"), stamp]
        if phase == "reuse-completed":
            lines.append(bullet(style(f"Preserved best epoch {row.get('bestEpoch')} · validation loss {number('bestValidationLoss')}", "32")))
        return "\n".join(lines)
    if event in ("train-progress", "validation-progress"):
        percent = row.get("percent", 0)
        filled = max(0, min(20, int(percent / 5)))
        bar = "█" * filled + "░" * (20-filled)
        title = "TRAIN" if event == "train-progress" else "VALIDATE"
        lines = ["", style(f"  {title}  [{bar}]  {percent:5.1f}%", "1;36"), stamp]
        if event == "train-progress":
            lines.extend([
                bullet(style(f"Loss {number('trainingLoss')} average  ·  {number('batchLoss')} latest batch", "1")),
                bullet(f"Batch {row.get('batch', 0):,}/{row.get('batches', 0):,}  ·  {row.get('samples', 0):,}/{row.get('total', 0):,} examples"),
            ])
        else:
            lines.append(bullet(f"{row.get('samples', 0):,}/{row.get('total', 0):,} examples"))
        lines.append(bullet(f"ETA {duration('etaSeconds')}  ·  {number('samplesPerSecond', 0)} examples/s"))
        if event == "train-progress":
            lines.extend([
                style(bullet(f"Elapsed {duration('elapsedSeconds')}  ·  LR {row.get('learningRate')}  ·  gradient norm {number('gradientNorm')}"), "2"),
                style(bullet(f"GPU GiB: {number('gpuAllocatedGiB', 2)} allocated / {number('gpuReservedGiB', 2)} reserved / {number('gpuPeakGiB', 2)} peak"), "2"),
            ])
        return "\n".join(lines)
    if event == "epoch-end":
        improved = row.get("improved", False)
        result = "NEW BEST" if improved else "NO NEW BEST"
        lines = ["", style(f"  EPOCH {row.get('epoch')} COMPLETE  ·  {result}", "1;32" if improved else "1;33"), stamp,
                 bullet(style(f"Validation loss {number('validationLoss')}  ·  best {number('bestValidationLoss')} (epoch {row.get('bestEpoch')})", "1")),
                 bullet(f"F1 {100*row.get('validationF1', 0):.2f}%  ·  accuracy {100*row.get('validationAccuracy', 0):.2f}%"),
                 bullet(f"Training loss {number('trainingLoss')}  ·  stale epochs {row.get('staleEpochs')}/{row.get('patience')}"),
                 style(bullet(f"Precision {100*row.get('validationPrecision', 0):.2f}%  ·  recall {100*row.get('validationRecall', 0):.2f}%  ·  threshold 0.5"), "2"),
                 style(bullet(f"Epoch time {duration('elapsedSeconds')}  ·  LR {row.get('learningRate')} → {row.get('nextLearningRate')}"), "2")]
        return "\n".join(lines)
    tone = "1;31" if event in ("failed", "interrupted") else "1;33" if event == "heartbeat" else "1;36"
    lines = ["", style("  " + event.replace("-", " ").upper(), tone), stamp]
    for key, value in row.items():
        if key not in ("timestamp", "pid", "event", "run", "epoch", "phase"):
            lines.append(bullet(f"{key}: {value}"))
    return "\n".join(lines)


class Progress:
    def __init__(self, root, interval=10):
        self.root = Path(root)
        self.interval = interval
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.state = {}
        self.last = time.monotonic()
        self.thread = threading.Thread(target=self._heartbeat, daemon=True)
        self.thread.start()

    def emit(self, event, **fields):
        with self.lock:
            self.state.update(fields)
            row = dict(self.state, event=event, timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), pid=os.getpid())
            # Preserve colors in the file so tail -F displays them too. NO_COLOR
            # disables styling; structured JSON files never contain ANSI codes.
            display = {k: row[k] for k in ("timestamp", "event", "run", "epoch", "phase", "batches") if k in row}
            display.update(fields)
            line = render(display, color="NO_COLOR" not in os.environ)
            print(line, flush=True)
            with (self.root / "progress.log").open("a") as stream:
                stream.write(line + "\n")
            with (self.root / "events.jsonl").open("a") as stream:
                stream.write(json.dumps(row) + "\n")
            temporary = self.root / "status.json.tmp"
            temporary.write_text(json.dumps(row, indent=2) + "\n")
            temporary.replace(self.root / "status.json")
            if event != "heartbeat":
                self.last = time.monotonic()

    def phase(self, phase, **fields):
        with self.lock:
            self.state = {"phase": phase, **fields}
            self.emit("phase", **self.state)

    def _heartbeat(self):
        while not self.stop.wait(self.interval):
            with self.lock:
                age = time.monotonic() - self.last
                if age >= self.interval * 2:
                    self.emit("heartbeat", phase=self.state.get("phase"), run=self.state.get("run"),
                              secondsSinceProgress=round(age, 1), message="No new progress report; process is alive, GPU progress is not confirmed")

    def close(self):
        self.stop.set()
        self.thread.join(timeout=2)
