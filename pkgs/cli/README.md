# spcr

The executable is `spacer`:

```sh
npm install -g spcr
spacer .
spacer . --check --model spacer-lines-ts
```

Recursively formats supported files, honoring nested `.gitignore` and `.spacerignore` files. Symlinks and dependency/build directories are skipped. Writes use atomic replacement. `--check` exits 1 when changes are needed; file errors exit 2. Run `spacer --languages` for the grammar inventory.

Both trained models are bundled. Custom model directories must contain `config.json`, `best/model.json`, and `best/weights.bin`. Lookup order is `--model-dir`, `SPACER_MODEL_DIR`, an ancestor's `tmp/<model>`, `~/.cache/spcr/<model>`, then bundled weights. The default is `spacer-tree-sitter`; `spacer-lines-ts` handles JS/TS only. Tree-model training currently uses TypeScript labels; other languages have tokenizer compatibility tests, not measured formatting quality.

The npm tarball contains compiled JavaScript. Packing requires trained artifacts under `tmp/spacer-lines-ts` and `tmp/spacer-tree-sitter`; prepack copies only config and inference weights. Publish workspace dependencies `@spcr/playground`, `@spcr/tree-sitter`, and `@spcr/model` before `spcr`. Native TensorFlow.js requires a supported platform and its install script. Repository development uses `mise exec -- node pkgs/cli/src/cli.ts .`.
