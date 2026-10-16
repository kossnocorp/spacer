# Tree-sitter model comparison

Measured on 2026-10-16 using native TensorFlow.js CPU inference; training used PyTorch 2.10 / ROCm 7.1 on gfx1100 (RX 7900 XTX).

| Model | Parameters | Weight bytes | Test accuracy | Test F1 | Bytes/s | LOC/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| spacer-lines-ts | 2,466,481 | 9,865,924 | 92.05% | 88.22% | 1,525,143 | 47,441 |
| spacer-tree-sitter | 72,097 | 288,388 | 89.31% | 84.26% | 925,548 | 28,790 |

The tree model is **34.2× smaller**, but this version is less accurate and its full formatting pipeline is slower. Tokenization, worker communication, and syntax-preservation verification contribute to tree-model runtime; smaller weights alone do not imply faster formatting.

Quality uses exactly the same **689,969 held-out boundary targets**, with each model's validation-selected threshold (0.41 lines / 0.40 tree). This is a comparison of the two trained systems, not a controlled tokenizer ablation: line training retained more examples and the input representations differ. Training and test labels are TypeScript/TSX only. No cross-language quality claim is made.

Throughput is a single sequential run on the first 1,000 parseable held-out files in corpus order (4,819,492 bytes / 149,915 physical lines), not a randomized corpus-wide sample. Four rejected files are listed in the raw report. Both models process identical input bytes. Timing includes reads, preparation, inference, rendering, and the tree formatter's syntax verification; excludes output writes and model loading. Model loading took 8.13 ms / 1.68 ms respectively. Input fingerprint: `aadd207da60f3530c5b1e109bd01a643e4d744d114040dfba40b6f5d4786777b`.

## Training and provenance

- The complete-file ordered teacher corpus and original file-group splits were retained. Exact encoded-context deduplication subsequently removed duplicates across splits, prioritizing training examples. Conflicting duplicate labels are counted; the first target is retained.
- Encoded train/eval/test: **3,237,027 / 683,166 / 689,969** examples.
- Invalid-source/parse exclusions: **233,212 / 44,936 / 53,141** examples. Individual file reasons are recorded in `tmp/model-encoded-tree-sitter/excluded.json`.
- Five epochs, checkpoint 5 selected by validation log loss; training took **218.4 seconds** excluding TypeScript corpus preparation and CPU export/evaluation.
- Export parity max absolute probability error: **3.5763e-7**.
- Encoded manifest SHA-256: `4bf8f0833fc15dfadd0962a81403c92c9e2dee0ed81332ed02acb7f46db4d3be`.
- Teacher corpus manifest SHA-256: `655ed4095a0453544acb99009220b64308b7e71be02de97d3a7b1d7e9c13d53c`.

## Reproduction

`mise //pkgs/model:train:tree-sitter` prepares data in TypeScript, trains in Python, exports, and evaluates. Output directories must not already exist. `mise //pkgs/model:benchmark:models` produces the matched comparison.

Raw comparison: `reports/tree-sitter/comparison.json`. Full grammar inventory: `reports/tree-sitter/grammar-types.json`. Trained model: `tmp/spacer-tree-sitter`; preserved line model: `tmp/spacer-lines-ts`.
