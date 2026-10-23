# Spacing-context cross-attention v1

## Frozen first-run protocol

Train from scratch, seed 42, with the best existing `CrossAttention` architecture
(3.61M parameters, BPE + compact Tree-sitter, eight latent queries). Accuracy takes
priority over inference throughput. No spacing corruption for this first run.

Use the latest published original-source top-100 TypeScript and Rust corpora:
`github-top100-{typescript,rust}-2026-10-17-v2`. Preserve source hashes and upstream
labels. Preserve existing file-group split algorithm and salt, targeting 70/15/15.
All safe inter-line boundaries are now admitted, including block edges and around
comments. Protected literal/comment interiors and explicit line continuations are
excluded. Files failing parse/UTF-8 checks are audited, not silently rewritten.

For each gap, take five nonempty lines per side and retain their internal blank
lines. Omit the **entire current gap** before tokenization, regardless of its
original length. Line-wise cl100k_base is capped at 128 tokens/side. Compact syntax
uses 64 tokens/side; row positions only partition the streams and are never input
features. No original-gap flag or language ID is passed to the model. Labels are
binary upstream blank-line presence. Exact lexical input deduplication is retained.

Inference processes all eligible gaps top-to-bottom. Earlier predicted spacing
replaces earlier original spacing; future context retains original spacing. The
current gap is always hidden. All predictions use the same frozen threshold.
Syntax-tree fingerprint checking and nonblank source preservation still apply.

Training uses the established FP32 GPU recipe: AdamW .001, weight decay .001,
batch 512, gradient clipping 1, validation-loss plateau LR reduction, max 40
epochs and patience 7. Select minimum validation log loss, then calibrate one
threshold on validation accuracy with F1 tie-break (.100:.005:.900). Save optimizer,
scheduler, CPU/GPU RNG, histories and weights at every epoch for resumption.

Teacher-forced validation (original surrounding spacing) is **not** sequential
formatting accuracy. After export, evaluate the frozen model sequentially on a
deterministic validation-file sample, both original and eligible-gap-stripped
inputs, against original labels. Do not tune on the previously opened legacy test
partition, or claim it is a fresh untouched test set. New boundary membership also
means older benchmark accuracy is not a matched comparison.

## Reproduction

`mise run research:spacing-context` runs encoding, resumable GPU training, export,
parity checks, and sequential validation. Encoding writes an `INCOMPLETE` marker;
an interrupted encoding directory must be preserved/renamed before restarting.
Completed encoded data is reused only when its corpus and implementation hashes
match the frozen campaign. Training resumes only with identical settings/hashes.

Artifacts: `tmp/spacing-context-v1/`; encoded records and per-file membership:
`tmp/encoded-spacing-context-v1/`; export:
`tmp/spacer-tree-sitter-spacing-context-1/`. Tracked provenance/results:
`docs/benchmark-data/spacing-context-v1/`. No paid Jev requests.
