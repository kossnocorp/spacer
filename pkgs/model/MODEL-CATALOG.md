# Versioned model releases

The shared registry is `src/catalog.ts`. The playground `/` lists every model in
this registry and uses its ID in API requests. Jev remains a separate teacher API.
`/tokenizer` explains the Lines BPE, Tree-Sitter byte, and Tree-Sitter compact-ID
encodings and identifies which models use them.

| Model ID | R2 prefix in `spacer-models` |
| --- | --- |
| spacer-tree-sitter-cross-attention-1 | models/tree-sitter-cross-attention-1/ |
| spacer-lines-1-ts | models/lines-1-ts/ |
| spacer-tree-sitter-bytes-1 | models/tree-sitter-bytes-1/ |
| spacer-tree-sitter-bytes-long-1 | models/tree-sitter-bytes-long-1/ |
| spacer-tree-sitter-bytes-wide-1 | models/tree-sitter-bytes-wide-1/ |
| spacer-tree-sitter-contextual-1 | models/tree-sitter-contextual-1/ |
| spacer-tree-sitter-regularized-seed42-1 | models/tree-sitter-regularized-seed42-1/ |
| spacer-tree-sitter-regularized-seed123-1 | models/tree-sitter-regularized-seed123-1/ |
| spacer-tree-sitter-regularized-seed2026-1 | models/tree-sitter-regularized-seed2026-1/ |
| spacer-tree-sitter-ensemble-1 | models/tree-sitter-ensemble-1/ |
| spacer-tree-sitter-compact-1 | models/tree-sitter-compact-1/ |

Each release contains `config.json`, `best/model.json`, `best/weights.bin`,
`export-check.json`, and `release.json` (description, validation metrics, tokenizer
metadata and SHA-256 file checksums). The ensemble's TFJS model is self-contained;
its training configuration still records the original member directories for
provenance, which inference does not read. No test evaluations run during export
or publication. Trial thresholds are their saved values (usually 0.5); only the
selected models had thresholds calibrated on validation.

Cross-Attention v1 uses the frozen seed-42 lexical–Tree-sitter checkpoint from the
v2 research campaign: 92.492% matched test accuracy and 88.517% F1. Its hybrid
tokenizer combines line-wise cl100k_base BPE (128 tokens per side, five lines)
with compact schema-2 syntax (64 tokens per side). Inference is implemented in
`src/attention-predict.ts`, with PyTorch/TFJS parity tested across batch sizes.
For this `attention` family, `best/model.json` is a tensor-spec manifest, not a
TFJS LayersModel graph; `config.json` identifies `spacer-cross-attention-1`.
The playground dispatches automatically and retains syntax-preserving rendering.

Export once with `mise run research:export-attention`. Publish just this release:

```sh
mise exec -- node pkgs/model/src/publish-models.ts --model spacer-tree-sitter-cross-attention-1 --upload
```

Stage locally with `mise exec -- node pkgs/model/src/publish-models.ts`.
Publish with `CLOUDFLARE_ACCOUNT_ID=<bucket-owner> mise //pkgs/model:publish:models`.
The publisher uses `cf r2 objects put`, uploads release metadata last, and stops
on any export/parity/upload failure. Local releases and their catalog are staged
in `tmp/model-releases`. Use a new version ID when changing a released model.

The local playground loads preserved model directories from the registry, not
R2 at request time. Line models accept JS/TS; tree models accept supported grammar
extensions. All current training labels are TypeScript/TSX, so support for parsing
other languages does not establish spacing accuracy in those languages.
