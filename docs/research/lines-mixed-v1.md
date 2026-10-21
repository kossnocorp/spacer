# Bilingual Lines experiment v1

Train one model from scratch on the original-spacing top-100 Rust and TypeScript
corpora. Reuse the v2 encoding and exact deduplicated, file-group split membership:
19,454,891 training and 4,022,787 validation boundaries. The reserved test set stays
closed throughout architecture, checkpoint, threshold, and seed decisions.

## Hypothesis and search

The previous Lines model has a substantial scoring-speed advantage over the
lexical–syntax cross-attention model. Its global convolution pooling loses local
order; retaining contextual features immediately around the boundary may recover
accuracy cheaply. All candidates consume only the 256 line-wise BPE tokens, with
blank lines removed. Neither syntax tokens nor language IDs enter the model.

- **baseline:** existing 24-dimensional embedding, 32-channel convolution,
  16 nearest raw tokens on each side, 64-unit head.
- **context-small:** 32-dimensional embedding, 32-channel convolution,
  24 nearest raw and 8 contextual tokens per side, 128-unit head, dropout .25.
- **context-dilated:** 48 channels and two convolution layers (dilations 1, 2),
  otherwise the small contextual model, dropout .3. Expanded kernels avoid the
  previously observed slow ROCm dilated-convolution solver.

Each gets the full mixed training set at its natural language frequency, seed 42,
up to 40 epochs, AdamW (learning rate .001, weight decay .001), batch 512, FP32,
gradient norm clipping 1, validation-loss LR reduction, and patience 7. Checkpoints
minimize validation log loss (minimum improvement .0001). One shared threshold is
calibrated on validation accuracy, F1 tie-break, on the existing .100:.005:.900 grid.
Architecture selection maximizes mean Rust/TS validation accuracy, overall F1
tie-break. The selected architecture is trained again from scratch with seed 123
as a confirmation; seed 42 remains primary regardless of that result.

This makes all candidates single bilingual models, not per-language dispatch or
an ensemble. No teacher labels, pretrained weights, or test-based selection.

## Measurement and reproducibility

Run `mise run research:lines-mixed`. The campaign resumes at epoch boundaries and
rejects changes to its frozen protocol or implementation. It shares the research
GPU lock. Checkpoints, optimizer/RNG states, validation predictions, and histories
live in `tmp/lines-mixed-v1/`; protocols and completed summaries are copied into
tracked `docs/benchmark-data/lines-mixed-v1/`. Live progress is in
`tmp/lines-mixed-v1/progress.json`.

The initial campaign runs as the transient user service
`spacer-lines-mixed-v1.service`, with logs at `tmp/lines-mixed-v1.log`.
Use `systemctl --user status spacer-lines-mixed-v1.service` to inspect it.
After reboot, rerun the mise task to resume from the last completed epoch.

The speed comparison uses the original-trained mixed cross-attention checkpoint,
matched real validation inputs per language, FP32 PyTorch, eight CPU threads,
batch sizes 1 and 512, one warm-up, and 20 measured repeats. All timings are saved;
median boundaries/sec is **scoring throughput**, not full-file LoC/sec. Full-file
deployment measurements require export and parity verification first.

The campaign freezes its primary choice and leaves test evaluation to a separate
one-shot matched comparison. Validation wins are not held-out wins. Both language
metrics must be reported; corpus-weighted accuracy alone can hide a Rust regression.
Existing published measurements and prior evaluation history remain available.

## Frozen evaluation and release

The completed search selected `context-dilated-seed42`; the confirmation run is
`context-dilated-seed123`. The three primary trials stopped after eight epochs;
confirmation stopped after nine. A GPU hang interrupted confirmation during
epoch 2; it resumed from the preserved epoch-1 optimizer/RNG checkpoint. No
test labels were used in any training or recovery decision.

`mise run research:finalize-lines-mixed` freezes checkpoint hashes, thresholds,
dataset identity, primary identity, and evaluator implementation before opening
the original reserved test set. It evaluates the primary, mixed baseline,
confirmation, and existing mixed cross-attention control on CPU. Per-model
predictions are cached atomically for interruption recovery; a completed run is
reused, not rerun. The marker is
`tmp/encoded-v2-original/TEST-OPENED-lines-mixed-v1.json`; tracked plans, language
metrics, and paired correctness counts live in
`docs/benchmark-data/lines-mixed-v1/held-out{,-plan}.json`.

Exports (each task creates a new directory and refuses to overwrite an export):

```sh
mise run research:export-lines-mixed
mise run research:export-original-attention
mise benchmark
```

The new playground entry is **Spacer Lines v1 Rust + TypeScript**,
`spacer-lines-mixed-1`, at `tmp/spacer-lines-mixed-1/`. Its frozen global threshold
is 0.52. The inference model has 3,540,257 FP32 parameters. Training-only parity
fixtures pass across batch sizes 1, 7, and 128; the initial maximum export error
was 2.384185791015625e-7. Pinned TS and Rust examples retain all nonblank lines
byte-for-byte through formatting. The original-trained attention export is a
benchmark control at `tmp/spacer-tree-sitter-cross-attention-original-1/`.

The bilingual release is published in bucket `spacer-models` under
`models/lines-mixed-1/`. All five release objects were downloaded and byte/hash
verified; see `docs/benchmark-data/lines-mixed-v1/release-verification.json`.
The publisher reads `trainingLanguages` from the export, including Rust.

Both bilingual models are now registered in the playground and published:

- `spacer-lines-mixed-1` → `spacer-models/models/lines-mixed-1/`
- `spacer-tree-sitter-cross-attention-original-1` →
  `spacer-models/models/tree-sitter-cross-attention-original-1/`

The latest deployment read-back verified all ten objects, with Rust present in
both release manifests. See
`docs/benchmark-data/lines-mixed-v1/deployment-verification.json`.
Each prefix contains `release.json`, `config.json`, `export-check.json`,
`best/model.json`, and `best/weights.bin`. Deployment must materialize the latter
four files under the corresponding `tmp/<model-id>/` catalog directory before
starting the playground. Model weights are runtime assets, not bundled by Vite.

Verification completed: all 16 model tests, model TypeScript checking, production
playground build, and live `/api/format` requests using the new model ID for TS and
Rust. The model catalog supplies the playground selector; no separate UI model
list is maintained. Interactive browser controls were not exercised in this run.

The [benchmark](../benchmark.md) generator incorporates the saved held-out results
and CPU-scoring measurements, then measures full formatting separately for the
two original-trained bilingual models and historical Jev-trained models. It
never evaluates test data or calls Jev. Per-run source/weight hashes and individual
timings are saved with the generated report.
