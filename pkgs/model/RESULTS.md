# First local model runs

## Corpus

Source: 12,577 completed VS Code files, paired against baseline commit `58181b264db032cac1548447c04a344124b17d66`. No pairs excluded. Labels are actual after-state spacing decisions.

| Split | Files | Unique boundaries | Blank-line positives |
| --- | ---: | ---: | ---: |
| Train | 8,776 | 1,018,488 | 257,489 |
| Validation | 1,886 | 240,512 | 59,087 |
| Test | 1,915 | 225,816 | 56,568 |

70/15/15 hash-group targets produce approximate file proportions. Removed 59,850 duplicate windows, including 15,271 cross-split duplicates and 824 conflicting-label duplicates. Deduplication uses source windows before token truncation; distinct long windows can still encode identically. Near duplicates are not clustered.

Five context lines per side, cl100k_base BPE, 128 tokens per side, 2,466,481 parameters. Encoded manifest SHA-256: `b2fddf4d986997c1a6dd5cfa068319f7de09c7aff8e072b3eaefc8fb1fb00243`.

## Training and held-out results

Both runs used batch size 512, seed 42, up to five epochs and patience two. Checkpoint selection used validation log loss; threshold selection used validation F1. Each frozen model was evaluated once on test. GPU settings were not tuned using CPU test results.

| Metric | CPU TensorFlow.js | Radeon PyTorch/ROCm |
| --- | ---: | ---: |
| Epochs completed / selected | 3 / 1 | 4 / 2 |
| Training + selection time | 442.1 s | 67.4 s |
| Epoch incl. validation | 142–146 s | 16–18 s |
| Selected threshold | 0.41 | 0.50 |
| Validation log loss | 0.12790 | 0.12893 |
| Test accuracy | 94.76% | 94.79% |
| Test precision | 88.41% | 89.48% |
| Test recall | 91.01% | 89.76% |
| Test F1 | 89.69% | 89.62% |
| Test log loss | 0.12333 | 0.12561 |
| Test approximate PR AUC | 0.96731 | 0.96710 |
| Accuracy on teacher-changed boundaries | 80.61% | 80.66% |

Preserving original spacing scores 87.01% accuracy / 74.24% F1; always predicting no blank line scores 74.95% accuracy. These are teacher-imitation metrics on held-out files from one repository, not independent judgments of formatting quality. Initializations and framework execution differ between runs.

Artifacts are local and ignored by Git: `tmp/model-corpus`, `tmp/model-encoded`, `tmp/model-run`, `tmp/model-rocm`. Each model directory contains config, history, exported model, and `test-report.json`. GPU export parity on eight examples: maximum absolute probability error `2.086162567138672e-7`.

## Formatting throughput

Measured the ROCm-trained model using the production **TensorFlow.js CPU inference** path on Ryzen 9 9950X, Node 26.10.0. All 1,915 held-out files in their current working-tree state: **24,665,932 UTF-8 bytes**, **694,898 physical lines**, 235,537 candidate boundaries (before corpus window deduplication).

Three sequential fresh-process runs, inference batches of 512 and groups of 32 files. Tokenizer caches start empty each run; filesystem caches are not flushed. Median rates:

| Scope | Input bytes/sec | LOC/sec |
| --- | ---: | ---: |
| Full formatting pipeline | 1,737,142 | 48,939 |
| Tokenization + model scoring | 2,219,897 | 62,540 |

Full pipeline times: 14.213, 14.199, 14.020 seconds; throughput range 1.735–1.759 MB/sec (decimal). Includes source reads, oxfmt normalization, syntax/candidate analysis, tokenization, model execution and output rendering. Excludes process/module startup and output writes. Model loading adds 12.5–13.1 ms. LOC includes comments and blank lines; a trailing newline does not count as an extra line. Bytes count each input file once, not repeated context windows. No source files were modified.

Reproduce from the workspace root:

```sh
mise exec -- node pkgs/model/src/benchmark.ts
```

Raw measurements: `tmp/model-rocm/benchmark-{1,2,3}.json`. Combined input SHA-256: `0176e12a95e16aba0cc4e2299d6cce502efd6dba1506d2569efb86afe983b989`.
