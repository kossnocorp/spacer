# Bilingual Lines experiment records

- `protocol.json`: predeclared training/selection rules, dataset and implementation hashes.
- `*-seed42.json`: all primary candidates, complete epoch histories and validation metrics.
- `context-dilated-seed123.json`: confirmation run; never substitutes for the primary.
- `selection.json`: validation-selected primary, frozen before test access.
- `complete.json`: training/search completion marker (not a held-out completion marker).
- `performance.json`: CPU **scoring-only** timings, real matched validation inputs,
  per-language batch sizes 1 and 512, 20 repetitions; excludes formatting overhead.
- `held-out-plan.json`: exact checkpoint hashes and fixed thresholds saved before
  test records were opened. Resumption requires the same plan and evaluator hash.
- `held-out.json`: test metrics and paired correctness counts. Only use when
  `complete` is true. Paired counts are descriptive; boundaries within files are
  correlated, so no independent-boundary significance claims are made.
- `release-verification.json`: byte-for-byte R2 read-back verification of all five
  bilingual model release objects, including SHA-256 hashes.

Large checkpoints, optimizer/RNG states, validation/test prediction arrays, and
training logs remain under `tmp/lines-mixed-v1/`. The reserved-set access marker is
`tmp/encoded-v2-original/TEST-OPENED-lines-mixed-v1.json`. Evaluation can resume
interrupted scoring but cannot change selection or thresholds.

Full-file formatting timings are recorded separately in timestamped `../runs/`
directories by `mise benchmark`, with input/export hashes and the generated report.
That command consumes saved accuracy metrics and never opens test records or calls
Jev. See [protocol and reproduction](../../research/lines-mixed-v1.md).
