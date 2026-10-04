# Ordered-responsibilities retraining

## New teacher pass

The production Jev policy is now the **ordered-responsibilities** prose prompt with neutral per-boundary questions and criteria. Context remains five lines per side, threshold 55%. All 25 cloned repositories were reset to the recorded upstream commits and normalized with oxfmt before relabeling. Previous teacher labels were not mixed into this run.

- Teacher: `jev-1.13.0`.
- 133,723 discovered tracked TypeScript files across 25 repositories.
- **83,098 fully processed files**, representing 15,747,151 baseline physical lines.
- 50,480 files not processed after the budget ran out; 145 parse/formatting/scoring failures.
- 22 repositories have no unattempted files; VS Code, n8n, and OpenClaw remain partial.
- 5,411,419 successful boundary decisions in 43,081 API requests; 1,692.6 seconds including final diff generation.
- HTTP 402 ended API processing. Only files with all candidate probabilities present were persisted as successful. The corpus builder independently validates every recorded boundary score.
- 620,949 blank lines added and 375,558 removed relative to the new oxfmt baselines.

The scheduler visits repositories round-robin in groups of 64 files. This gives the corpus coverage across all 25 repositories before exhaustion, although incomplete repositories retain alphabetic-order sampling bias.

Teacher artifacts: `tmp/full-run-ordered/` contains exact prompt/config in `usage.json`, Git baseline manifests, per-file completion journals and probabilities, diffs, `files.csv`, and `summary.json`.

## Corpus

83,097 completed files passed corpus validation. One additional Astro fixture was excluded because Git could not resolve its baseline path (`^--with-carets/Counter.tsx`). There are **5,163,542 unique boundary examples**, with 218,465 duplicate windows omitted, including 46,663 cross-split duplicates and 4,181 conflicting-label duplicates.

| Split | Files | Examples | Positive labels |
| --- | ---: | ---: | ---: |
| Train | 57,947 | 3,628,041 | 1,187,940 |
| Validation | 12,558 | 760,194 | 249,482 |
| Test | 12,592 | 775,307 | 257,512 |

Targets are 70/15/15 by seeded normalized-file groups, not exact example quotas. Partial files and failed files contribute no examples. Labels come from the actual new Jev-formatted after-state; completion probabilities validate eligibility but are not training targets or input features.

## Training and held-out evaluation

RX 7900 XTX / PyTorch 2.10.0+ROCm 7.1, batch 512, seed 42, Adam, maximum five epochs and patience two. Early stopping completed three epochs; epoch one had the best validation log loss. Training and selection took **163.4 seconds**, with epochs including validation taking 52.7–55.7 seconds.

The frozen threshold selected on validation is **0.41**. The test split was evaluated once after selection, without retuning.

| Held-out metric | New model | Preserve original spacing |
| --- | ---: | ---: |
| Accuracy | 92.03% | 81.71% |
| Precision | 87.62% | 76.51% |
| Recall | 88.50% | 64.84% |
| F1 | 88.06% | 70.19% |

Test log loss: 0.18027; approximate PR AUC: 0.95952. On the 141,798 boundaries changed by Jev, accuracy is 78.89% and F1 is 82.66%. These measure imitation of the new teacher policy on held-out file groups from the represented repositories, not unseen-repository generalization.

Exported PyTorch/TypeScript probabilities agree within `1.1920928955078125e-7` on eight parity examples. The playground defaults to the new model; `SPACER_MODEL_DIR` can override it.

- Corpus: `tmp/model-corpus-ordered/`.
- Encoded data: `tmp/model-encoded-ordered/`.
- Model and frozen config: `tmp/model-rocm-ordered/`.
- History: `tmp/model-rocm-ordered/history.json`.
- Test report: `tmp/model-rocm-ordered/test-report.json`.
- Corpus manifest SHA-256: `655ed4095a0453544acb99009220b64308b7e71be02de97d3a7b1d7e9c13d53c`.
- Encoded manifest SHA-256: `64c5feff65516b22882d606c6daf1546e4ea8add6ac6132ddd917a987c9c8dcd`.

## Local inference performance

Measured 2026-10-04 with the exported ordered model on **AMD Ryzen 9 9950X**, TensorFlow.js native CPU, Node 26.10.0. Radeon was used for training; these are CPU inference measurements.

Workload: all **12,592 held-out files** in their current Jev-formatted working-tree state, totaling **79,428,545 UTF-8 bytes**, **2,397,808 physical lines**, and **803,966 eligible boundaries** before corpus deduplication. Each input file counts once; overlapping context windows are not counted again. LOC includes blank lines and comments.

Three sequential fresh-process runs, empty initial tokenizer cache, normal OS filesystem caching, 512-boundary inference batches, 32-file groups, preparation concurrency eight:

| Scope | Median input bytes/sec | Median LOC/sec |
| --- | ---: | ---: |
| Full formatting pipeline | **1,541,882** | **46,547** |
| Including model loading | 1,541,468 | 46,534 |
| Tokenization + model scoring | 1,967,702 | 59,401 |

Full pipeline includes reads, oxfmt normalization, syntax analysis, tokenization, model execution, and output rendering. It excludes process/module startup and output writes. Tokenization + scoring is not a neural-network-only timing.

| Run | Pipeline seconds | Bytes/sec | LOC/sec |
| --- | ---: | ---: | ---: |
| 1 | 51.514 | 1,541,882 | 46,547 |
| 2 | 51.305 | 1,548,168 | 46,736 |
| 3 | 51.603 | 1,539,211 | 46,466 |

Median phase times: preparation 10.918 s, tokenization/scoring 40.366 s, rendering 0.099 s. Model loading took 12.0–13.8 ms. End-to-end throughput is **1.54 MB/sec** (decimal), with less than 0.6% variation across the three runs. Phase medians are calculated independently and need not sum to median wall time.

Raw reports: `tmp/model-rocm-ordered/benchmark-{1,2,3}.json`. Input fingerprint: `40e7b6161e2110c8244c824795ab423de775e8f63cdc1eb60af452297e4a614b`. Source files were not modified. This workload differs from the first model's VS Code-only benchmark, so those timings are not a controlled model-to-model comparison.

```sh
mise exec -- node pkgs/model/src/benchmark.ts \
  --model tmp/model-rocm-ordered --corpus tmp/model-corpus-ordered \
  --out tmp/model-rocm-ordered/benchmark.json
```

## Reproduction

From the workspace root, with new output directories:

```sh
SPACER_RUN_DIR=tmp/full-run-ordered-next mise exec -- node pkgs/playground/src/full-run.ts baseline
SPACER_RUN_DIR=tmp/full-run-ordered-next mise exec -- fnox exec -- node pkgs/playground/src/full-run.ts space
mise exec -- node --max-old-space-size=16384 pkgs/model/src/corpus.ts \
  --run-dir tmp/full-run-ordered-next --out tmp/model-corpus-ordered-next
mise exec -- node pkgs/model/src/encode.ts \
  --corpus tmp/model-corpus-ordered-next --out tmp/model-encoded-ordered-next
mise exec -- node pkgs/model/src/rocm.ts train \
  --data tmp/model-encoded-ordered-next --out tmp/model-rocm-ordered-next
mise exec -- node pkgs/model/src/evaluate.ts \
  --data tmp/model-encoded-ordered-next --model tmp/model-rocm-ordered-next
```

`baseline` resets the cloned repository working trees. Corpus splits retain the existing seeded file-group 70/15/15 targets, exact-window deduplication, tokenizer and architecture. Validation selects checkpoint and threshold; test data is evaluated only afterward. These labels use a different policy and broader source coverage than the first model, so its previous test scores are not directly comparable.
