# @spcr/tree-sitter

Cross-language structural tokens and syntax-checked blank-line edits for `spacer-tree-sitter`.

The pinned bundles contain 53 grammar builds for 36 languages. Tests exercise every build: 51 parse fixtures, while Elm and QL explicitly reject their incompatible ABI 12 binaries. YAML and Lua use the compatible 0.20 runtime; Lua reuses and resets its worker-local parser for reliable repeated parsing. `languages` lists the 34 loadable languages; these bundles are the tested inventory, not every grammar published on npm.

Structural entities occupy IDs 0–46. Model encoding schema 2 uses `IDENTIFIER` followed by one local identity token (256–511), sharing a map across both sides of each prediction boundary. IDs are assigned in source order within the retained window; distant identifiers cannot consume IDs or change the representation. Names cost exactly two tokens, and truncation never splits an identifier. Each side supports 1–256 tokens (128 by default); this guarantees enough collision-free identity slots without hashing or overflow aliases.

`AsdQwe`, `asdQwe`, and `asd-qwe` normalize to `asd_qwe`. Identity means normalized spelling equality, not resolved variable bindings: shadowing and property/variable distinctions are not resolved. All identifier roles currently use the generic `IDENTIFIER` entity. Names themselves are intentionally absent from schema-2 model inputs. The map is local to the prediction context, not global across files.

The parser's public `tokenize()` event stream retains schema-1 normalized UTF-8 bytes for compatibility. `encodeContext()` collapses these into cached atomic units and emits schema 2. `encodeLegacyContext()` and `legacyTokenizerInfo` preserve schema-1 model inference; the model loader selects the encoder from saved tokenizer metadata. Existing weights cannot be reused as schema-2 weights.

Supported loop/function/return constructs map across grammars; unknown nodes remain explicit. Mapping coverage varies: for example, the bundled Scala grammar parses a for-comprehension as a call, so Scala's fixture currently verifies functions. Markup/data grammars have tokenization fixtures but may have no editable statement boundaries.

Encode new training data with `mise //pkgs/model:encode:compact`. Output goes to `tmp/model-encoded-tree-sitter-compact`; existing datasets and trained models are preserved. `train:tree-sitter` now trains/exports to `tmp/spacer-tree-sitter-compact` without automatically evaluating the test split. Existing tuning tasks still refer to the original experiment. File split membership is inherited, but compact-context deduplication can change admitted examples, so comparisons must account for changed evaluation membership. The old test set is a historical benchmark, not a new untouched holdout.

Formatting only changes gaps between complete sibling syntax nodes, preserves literal/comment contents, and reparses to verify the syntax-tree fingerprint. Parser runtimes run in workers. No grammar is downloaded at runtime.

```sh
mise exec -- pnpm --filter @spcr/tree-sitter test
mise exec -- node pkgs/tree-sitter/src/inspect.ts
mise //pkgs/model:train:tree-sitter
mise //pkgs/model:benchmark:models
```

Training preparation is TypeScript; training is Python/PyTorch on ROCm. The existing complete-file teacher corpus supplies labels, keeping its file-group 70/15/15 split assignments. Exact encoded contexts are additionally deduplicated across splits, so resulting example percentages can differ. Failed parses and changed source hashes are recorded in `excluded.json`. `INCOMPLETE` marks unfinished encodings. The paired line-model test binary uses exactly the retained tree-model test targets.

**Training labels are TypeScript/TSX only.** Cross-language tokenizer tests establish syntax compatibility, not measured spacing quality in Rust, Python, or other languages. Quality and throughput measurements are written to `reports/tree-sitter/comparison.json`.
