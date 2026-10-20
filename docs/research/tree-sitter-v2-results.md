# Tree-sitter v2 results

One-shot held-out comparison on **722,143 matched teacher-labeled boundaries**.

Architecture, seed-42 primary candidate, checkpoints and validation-calibrated thresholds were frozen before opening test records. No test-time selection or recalibration.

| Model                                            | Accuracy % |   F1 % | Log loss | Threshold |
| ------------------------------------------------ | ---------: | -----: | -------: | --------: |
| cross-attention-mixed-seed42                     |     92.492 | 88.517 |  0.17260 |       0.5 |
| cross-attention-mixed-seed123                    |     92.454 | 88.520 |  0.17300 |     0.505 |
| cross-attention-mixed-seed2026                   |     92.470 | 88.481 |  0.17326 |     0.525 |
| lines-mixed-seed42                               |     92.219 | 88.065 |  0.17910 |      0.52 |
| lines-mixed-seed123                              |     92.195 | 88.001 |  0.17934 |     0.525 |
| lines-mixed-seed2026                             |     92.240 | 88.088 |  0.17851 |     0.565 |
| historical-lines                                 |     92.105 | 88.199 |  0.17888 |      0.41 |
| historical-lines (validation accuracy threshold) |     92.193 | 88.038 |  0.17888 |      0.48 |

## Performance tradeoff

CPU scoring: historical Lines **99,779 boundaries/s**; cross-attention **8,604 boundaries/s**.

These are PyTorch CPU measurements with 8 threads, preencoded inputs, batch 512, and three repetitions. They exclude parsing, tokenization and rendering. An accuracy improvement is not a throughput win.

This is a lexical–Tree-sitter hybrid: BPE retains spelling/literals, while a separate compact-ID syntax stream contributes structural context. It is not an entity-only model.

Coverage: bundled grammars rejected 1,842 source files. All models use identical admitted examples and file-group splits; results are not a full-corpus comparison. Test rows inherit historical split assignments, whose aggregate metrics have been published for earlier models.

Raw results, frozen hashes, thresholds and paired correctness counts: `reports/research-v2/final-test.json`. Training/evaluation protocol: [tree-sitter-v2.md](tree-sitter-v2.md).
