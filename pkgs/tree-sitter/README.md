# @spcr/tree-sitter

Cross-language structural tokens and syntax-checked blank-line edits for `spacer-tree-sitter`.

The pinned bundles contain 53 grammar builds for 36 languages. Tests exercise every build: 51 parse fixtures, while Elm and QL explicitly reject their incompatible ABI 12 binaries. YAML uses the compatible 0.20 runtime. `languages` lists the 34 loadable languages; these bundles are the tested inventory, not every grammar published on npm.

Structural entities occupy IDs 0–46; normalized identifier UTF-8 bytes occupy 256–511, with structural delimiters. `AsdQwe`, `asdQwe`, and `asd-qwe` normalize to `asd_qwe`. Name bytes cannot collide with syntax IDs. Supported loop/function/return constructs map across grammars; unknown nodes remain explicit. Mapping coverage varies: for example, the bundled Scala grammar parses a for-comprehension as a call, so Scala's fixture currently verifies functions. Markup/data grammars have tokenization fixtures but may have no editable statement boundaries.

Formatting only changes gaps between complete sibling syntax nodes, preserves literal/comment contents, and reparses to verify the syntax-tree fingerprint. Parser runtimes run in workers. No grammar is downloaded at runtime.

```sh
mise exec -- pnpm --filter @spcr/tree-sitter test
mise exec -- node pkgs/tree-sitter/src/inspect.ts
mise //pkgs/model:train:tree-sitter
mise //pkgs/model:benchmark:models
```

Training preparation is TypeScript; training is Python/PyTorch on ROCm. The existing complete-file teacher corpus supplies labels, keeping its file-group 70/15/15 split assignments. Exact encoded contexts are additionally deduplicated across splits, so resulting example percentages can differ. Failed parses and changed source hashes are recorded in `excluded.json`. `INCOMPLETE` marks unfinished encodings. The paired line-model test binary uses exactly the retained tree-model test targets.

**Training labels are TypeScript/TSX only.** Cross-language tokenizer tests establish syntax compatibility, not measured spacing quality in Rust, Python, or other languages. Quality and throughput measurements are written to `reports/tree-sitter/comparison.json`.
