# Tree-sitter v2 experiment plan

## Hypothesis

The previous byte/entity and compact-identity tokenizers discard literals,
comments, spelling (compact), punctuation, and line layout. Increasing CNN
capacity did not recover this information. Lines is already token-based: it
uses BPE, with line-wise windows. Tree-sitter is a parser, not automatically a
better lexical representation.

The first new architecture is a **lexical–structural hybrid**, trained from
scratch: line-wise BPE preserves lexical evidence, and a separate Tree-sitter
compact-ID encoder supplies longer-range structural and repeated-name context.
Both streams use two contextual convolutions, retain ordered nearest-boundary
features, and feed a joint classifier. This is explicitly a hybrid, not evidence
that an entity-only tokenizer beats lexical models. Ablations include the Lines
architecture on exactly the same admitted examples.

A second candidate uses eight latent boundary queries with four-head
cross-attention over lexical and syntax tokens, learned relative positions,
padding masks, and an ordered local-feature path. It captures interactions
between streams without quadratic full-sequence self-attention. This candidate
and narrow/wide contextual hybrids are declared before inspecting their scores.

## Evaluation contract

- Preserve historical releases, corpora, and evaluations.
- No test metrics during architecture search. Checkpoints use validation log
  loss; decision thresholds maximize validation accuracy, with F1 tie-breaking.
- Report accuracy, F1, loss, parameter count, and CPU latency/throughput. A slower
  accuracy winner is not a simultaneous performance win.
- Freeze architecture and thresholds before final test evaluation. Never retry
  test selection until it wins. Repeated validation search can overfit validation.
- Hash-matched file-group 70/15/15 splits; deduplicate truncated lexical contexts
  train-first, with identical membership for Lines and hybrid architectures.
- Compare the frozen historical Lines model and a from-scratch Lines control;
  report exact common membership rather than comparing historical headline scores.
- New upstream corpora use original author spacing. Their results measure style
  imitation, not Jev agreement. Train Lines separately for TS and Rust, hybrid on
  mixed TS/Rust, and report per-language results as well as aggregate results.

## Commands

The first matched teacher dataset contains 3,394,780 training examples, 715,257
validation examples, and 722,143 reserved test examples. Current bundled grammars
reject 1,842 source files (1,195 TypeScript, 647 TSX), accounting for 331,289
omitted boundaries; 73 truncated lexical duplicate contexts are also omitted.
These exclusions are common to every compared architecture and recorded in
`tmp/encoded-v2-teacher/excluded.jsonl`. This is a coverage limitation, not a
full-corpus accuracy comparison.

```sh
mise run corpus:teacher
mise run corpus:collect
mise run research:encode-teacher
mise run research:campaign
mise run research:status
# Individual trial / resume commands:
mise run research:train -- --architecture hybrid --resume
mise run research:train -- --architecture lines --resume
mise run research:train -- --architecture hybrid-wide --resume
mise run research:train -- --architecture cross-attention --resume
mise run research:encode-original
mise run research:train-original
```

Training uses PyTorch/ROCm, int32 GPU-resident input tensors, per-tensor AdamW,
expanded dilated kernels, ten-second progress reports, and epoch resume
checkpoints. No hosted inference or paid model API calls are made.

`research:campaign` runs the four declared architecture/control trials, selects
the structural candidate on validation, then repeats it and the Lines control
with seeds 123 and 2026. It writes a frozen architecture selection and a matched
validation comparison against historical Lines. It does **not** automatically
open the test set. `research:train-original` reads that architecture selection
before training the TS-only and Rust-only Lines controls and the mixed candidate.

## GPU interruption and CPU continuation

On October 17 the graphics ring timed out during epoch 3 of the first hybrid
trial. Kernel logs recorded a `zen:cs0` submission, failed ring recovery, a full
GPU reset and VRAM loss; this does not establish which workload caused the hang.
The completed epoch-2 checkpoint is preserved in `tmp/research-v2/`.

The research campaign continues under `tmp/research-v2-cpu/`, with provenance
linking the copied epoch-2 checkpoint to its original run. CPU and GPU dropout
streams are not bit-identical. A CPU training probe measured about 9,540
examples/second, sufficient to continue the full-data search without relying on
the unstable GPU. All other trials start from scratch on CPU.

```sh
mise run research:campaign -- --cpu
mise run research:train-original -- --cpu
```

Frozen historical Lines on the exact 715,257 validation rows: **92.0065% accuracy,
87.9364% F1, 0.184709 log loss** at saved threshold 0.41. Accuracy calibration on
validation raises its accuracy to **92.0789%** at threshold 0.48. Candidate claims
must distinguish beating the shipped threshold from beating this calibrated
reference. No held-out test evaluation has run.

## Session-interruption recovery

After a later interruption, no research processes remained. The encoder log
reported SIGTERM; the CPU checkpoint retained four completed epochs. Training
was resumed at epoch 5 with optimizer/scheduler state intact. The incomplete
original-corpus encoding was preserved under
`tmp/encoded-v2-original.interrupted-20261017T053742Z` and encoding restarted.

The resumed jobs run as transient user services, independent of the assistant's
terminal lifetime:

```sh
systemctl --user status spacer-research-v2-cpu.service spacer-encode-v2-original.service
mise run research:status
```

Logs continue in `/tmp/opencode/spacer-research-v2-cpu.log` and
`/tmp/opencode/spacer-encode-v2-original.log`. These transient services survive
terminal disconnects, not machine reboots. The training service retries failures
with a 30-second delay, capped at three starts per hour; encoding requires manual
restart because it does not yet support checkpoint resumption.

## Completed GPU campaign

At the user's request, training returned to GPU in `tmp/research-v2-gpu/`.
That campaign completed successfully: four architecture/control trials and
three-seed comparisons for the selected cross-attention architecture and Lines.
Cross-attention validation accuracy was 92.34–92.37%; matched retrained Lines was
92.08–92.11%. The seed-42 candidate was selected before test access.

Measured PyTorch CPU scoring throughput was approximately 8,604 boundaries/s
for cross-attention versus 99,779 for historical Lines (preencoded inputs,
8 threads, batch 512). Thus the validation accuracy gain carries a substantial
CPU inference cost. These timings do not include parsing/tokenization/rendering.

`mise run research:finalize` freezes all three candidate seeds, paired Lines
controls, the historical reference and their thresholds before one held-out
comparison. It writes `reports/research-v2/final-test.json` and
`docs/research/tree-sitter-v2-results.md`. No further architecture or threshold
selection is performed on this test split.

Original-spacing training uses `mise run research:train-original -- --gpu-resume`
after mixed-corpus encoding finishes, selecting the frozen cross-attention
architecture for TS/Rust joint training and separate Lines controls per language.

## Original-spacing dataset and training

Encoding the cleaned top-100 corpora completed with 19,454,891 training rows,
4,022,787 validation rows and 4,087,878 reserved test rows. Training contains
13,071,627 TypeScript rows and 6,383,264 Rust rows; validation contains 2,739,595
TypeScript rows and 1,283,192 Rust rows. There were 12,306 file admission
exclusions and 937,050 duplicate contexts; detailed exclusions remain alongside
the encoded dataset. Labels represent unchanged upstream author spacing.

The original dataset exceeds a single V8 Set's 2^24-entry capacity; deduplication
now partitions complete SHA-256 hashes into 256 sets without changing admission
semantics. `original_v2.py` trains on read-only memory-mapped binaries, transferring
only each batch to the GPU, avoiding full-corpus RAM/VRAM copies. It retains the
same AdamW, scheduling, checkpoint and threshold-selection rules as the teacher
experiment. Model computation is GPU-only.

The sequential GPU job trains TS Lines, Rust Lines, then mixed cross-attention:

```sh
systemctl --user status spacer-original-v2-gpu.service
tail -n 50 -F /tmp/opencode/spacer-original-v2-gpu.log
```

Run directories are under `tmp/research-v2-original-gpu/`. Test labels remain
unopened during training and architecture selection.
