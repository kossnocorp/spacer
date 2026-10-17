# Watching and resuming the tuning search

From the workspace root:

```sh
tail -F tmp/tree-tuning/progress.log
cat tmp/tree-tuning/status.json
```

`progress.log` is a durable readable log, `events.jsonl` contains timestamped structured events, and `status.json` is atomically replaced with the latest status. Progress is flushed every ten seconds and after the first/final batch. `--log-seconds 5` changes the interval.

Training reports run/epoch/batch, percentage, batch and running loss, learning rate, pre-clipping gradient norm, examples/sec, elapsed time, epoch ETA, allocated/reserved/peak GPU memory. Validation reports progress, then loss, F1, accuracy, precision, recall, best checkpoint, improvement, stale epochs, patience and the next learning rate. F1 is at the fixed 0.5 reporting threshold; only the frozen final model gets its validation-calibrated threshold.

A heartbeat appears after two reporting intervals without progress. It means the process is alive, **not** that the GPU is making progress. For a stuck process, `kill -USR1 <pid-from-status.json>` prints all Python thread stacks to the process's stderr without stopping training.

Resume in a terminal after stopping the previous process:

```sh
mise //pkgs/model:tune:resume
```

Only one process can own a run directory (an OS file lock enforces this). Completed runs are reused after configuration validation. `last.pt` atomically stores model, optimizer, scheduler, RNG states, history and stopping state after each completed epoch. An interrupted epoch is replayed from that checkpoint. A legacy incomplete run without `last.pt` is archived and restarted from its original seed; completed legacy runs are kept. Restart does not change the predeclared search, splits or selection criteria.

## 2026-10-16 runtime correction

The first search was stopped after the completed baseline/wide trials when the contextual trial showed long silent intervals. The old logger only reported epoch completion. Synthetic batch-512 profiling found the native MIOpen dilated-convolution path emitted workspace/fallback warnings and took **208.65 ms/step**, versus **27.36 ms/step** for the same convolution expressed with explicit zero kernel taps (ten warm forward/backward steps, not a whole-training benchmark).

The `expanded` backend changes the GPU computation implementation, not the learned parameters or architecture. Double-precision forward/gradient equivalence tests pass; GPU float32 max logit difference was `4.38e-8`, max mean-logit gradient difference `7.05e-6`; differences arise from floating-point/reduction and ReLU effects. Expanded-backend trained weights export to the ordinary dilated TFJS architecture with max probability error `8.94e-8` in the smoke test. `--conv-backend native` remains available for diagnostics. No warnings are suppressed and no validation/test data were used to choose this runtime fix.

The resumed process later aborted during contextual epoch 8 with ROCm `GPU Hang` / SIGABRT. The traceback surfaced in multi-tensor AdamW, which does not conclusively identify the offending kernel because GPU execution is asynchronous. The epoch-7 checkpoint loaded successfully with finite weights, and a fresh GPU matrix multiplication passed. Subsequent training uses AdamW's per-tensor path (`foreach=False`), including after restoring older optimizer checkpoints. This is a conservative runtime workaround, not a confirmed driver fix; optimizer moments, learning rate, architecture, data splits and selection rules remain preserved. Epoch 8 is replayed from the epoch-7 checkpoint.
