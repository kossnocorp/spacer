# Local spacing model

TypeScript/Node training pipeline distilling the completed Jev formatting decisions into a local binary classifier. Uses **TensorFlow.js with native CPU TensorFlow** and the **cl100k_base LLM BPE tokenizer** from `gpt-tokenizer`.

## Run from the workspace root

```sh
pnpm install

# Defaults: 5 lines of context on EACH side, 70/15/15 train/eval/test targets.
node pkgs/model/src/corpus.ts \
  --run-dir tmp/full-run --repos-root tmp --out tmp/model-corpus \
  --context 5 --eval-percent 15 --test-percent 15 --seed spacer-v1

node pkgs/model/src/encode.ts \
  --corpus tmp/model-corpus --out tmp/model-encoded --tokens-per-side 128

node pkgs/model/src/train.ts \
  --data tmp/model-encoded --out tmp/model-run --epochs 5 --batch-size 512

# Only AFTER checkpoint and threshold selection are complete:
node pkgs/model/src/evaluate.ts \
  --data tmp/model-encoded --model tmp/model-run --split test

# Local inference; does not need TYPESAFE_API_KEY or fnox.
node pkgs/model/src/format.ts ./your-directory --model tmp/model-run --check
node pkgs/model/src/format.ts ./your-directory --model tmp/model-run
```

Output directories for corpus, encoding and training must be new directories. `INCOMPLETE` indicates an unfinished stage; the completed manifest/config is written last. For reruns or different context sizes, use new output directories. The corpus context default is imported from Jev's formatter defaults rather than duplicated.

## Corpus and labels

The reusable generator reads `*.baseline.json` plus `*.progress.jsonl` from a full-run directory. It uses only successfully processed files. For each:

1. Load the **before state from the recorded Git baseline commit**, and the **after state from the working tree**.
2. Use the same oxfmt normalization, protected whitespace handling, and structural candidate finder as Jev's formatter.
3. Verify that the after state differs only by formatting blank lines; reject mismatched or subsequently edited files.
4. At every eligible boundary, emit surrounding code with a target of `1` if the actual after state has a blank line, otherwise `0`.

All four transitions are represented: absent→absent, absent→present, present→absent, present→present. Training exclusively on changed lines would leave out the crucial examples where spacing should stay absent or present. The `originalLabel` is retained **only for auditing and baseline comparison**; it is never fed to the model. The generator does not use Jev probabilities as labels.

`train.jsonl`, `eval.jsonl`, `test.jsonl` hold examples. `files.jsonl` records file/group assignments, commit IDs and before/after hashes. `excluded.jsonl` records rejected pairs. `manifest.json` contains counts, class balance and reproducibility information.

### Split and leakage policy

- A seeded hash of the complete normalized, blank-stripped file assigns **70% training, 15% validation, 15% held-out post-training test** targets. These are deterministic group-level percentages, not exact quotas of windows; larger files cause example percentages to differ.
- All windows from the same file go to one split. Identical normalized files share a group and therefore a split.
- Exact duplicate context windows are removed globally, including across splits. The first occurrence in sorted repo/file order is retained. Later conflicting labels are counted and omitted, preserving the first observed target.
- Near-duplicate files with modified identifiers are not guaranteed to be clustered. These results measure held-out-file imitation of the teacher, not cross-repository generalization or objectively correct formatting.
- Validation selects the best checkpoint by log loss, then the decision threshold by F1. `train.ts` never opens the test binary. Test evaluation uses the frozen threshold and never tunes it.

## Tokenizer and model

The tokenizer uses the actual GPT-style **cl100k_base BPE vocabulary**, not word or character hashes. Tokenize each retained line with a newline and concatenate; caching lines avoids repeatedly encoding overlapping windows. This is line-wise BPE rather than necessarily the canonical tokenization of the entire concatenated window. Literal special-token strings in source code are treated as normal text.

- Reserve token 0 for padding; shift BPE IDs by 1.
- Keep the last 128 before-tokens and first 128 after-tokens by default. This preserves the immediate boundary when truncating long context. Truncation counts are recorded.
- Shared 24-dimensional token embeddings and a shared 32-filter convolution learn local code patterns.
- Separate max/average pooling for the two sides, plus position-preserving nearest-16-token features, retain information about which side of the boundary a pattern occurs on.
- A 64-unit dense layer, dropout and sigmoid produce a blank-line probability.
- About 2.47 million parameters; Adam optimizer, binary cross-entropy, deterministic data shuffle/initialization seed, validation-based early stopping.

This small two-sided TextCNN fits the binary local-boundary problem and trains on a CPU without downloading a pretrained language model. It is not an LLM fine-tune. Structural exclusions still come from the formatter: the model cannot restore array-group or region-comment boundaries that were never candidates in the original pipeline.

The learned probability threshold is selected on validation and need not equal Jev's 55% threshold. To override it at inference, use `--threshold PERCENT`.

## Artifacts and checks

- `tmp/model-corpus/`: JSONL paired corpus and split manifest.
- `tmp/model-encoded/`: fixed-width, explicitly little-endian uint32 token records and metadata.
- `tmp/model-run/best/`: TensorFlow.js model graph and binary weights.
- `tmp/model-run/config.json`: tokenizer, context, frozen threshold, validation metrics, corpus fingerprints.
- `tmp/model-run/history.json`: training/validation curves.
- `tmp/model-run/test-report.json`: held-out metrics and comparisons to always-no and preserve-original-spacing baselines, including performance specifically on teacher-changed boundaries.

`pnpm --filter @spacer/model check` and `pnpm --filter @spacer/model test` verify types, pair alignment, splits, token placement, metrics, training and serialization. Native TensorFlow needs a supported Node/Linux binary; installation enables only the `@tensorflow/tfjs-node` build script in the workspace.

For the verified Radeon/PyTorch training setup, see [GPU.md](GPU.md). Corpus generation, tokenization and inference remain TypeScript. Measured CPU/GPU results are in [RESULTS.md](RESULTS.md).
