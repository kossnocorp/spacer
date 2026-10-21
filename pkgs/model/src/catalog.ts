// Public names and immutable release prefixes, shared by UI and publishing.
export const modelTokenizers = {
  bpe: {
    key: "bpe",
    label: "Lines · line-wise BPE · cl100k_base (gpt-tokenizer 3.4.0)",
  },
  bytes: {
    key: "bytes",
    label: "Tree-Sitter · identifier bytes · schema 1",
  },
  compact: {
    key: "compact",
    label: "Tree-Sitter · compact identifier IDs · schema 2",
  },
} as const;

export const models = [
  {
    id: "spacer-lines-mixed-1",
    name: "Spacer Lines v1 Rust + TypeScript",
    family: "lines",
    tokenizer: modelTokenizers.bpe,
    directory: "tmp/spacer-lines-mixed-1",
    description:
      "One 3.54M-parameter lexical CNN trained from scratch on original Rust and TypeScript spacing. Held-out accuracy: 88.03% TS / 88.45% Rust. Frozen seed 42, shared threshold 0.52. Faster full-file formatting than the original-trained cross-attention model on the pinned examples.",
  },
  {
    id: "spacer-tree-sitter-cross-attention-original-1",
    name: "Spacer Cross-Attention v1 Rust + TypeScript",
    family: "attention",
    tokenizer: {
      key: "compact",
      label:
        "Hybrid v1 · cl100k_base BPE (128/side, 5 lines) + Tree-Sitter compact schema 2 (64/side)",
    },
    directory: "tmp/spacer-tree-sitter-cross-attention-original-1",
    description:
      "One 3.61M-parameter lexical–syntax model trained on original Rust and TypeScript spacing. Held-out accuracy: 88.46% TS / 88.68% Rust. Frozen seed 42, shared threshold 0.52. Higher accuracy but slower formatting than bilingual Lines on the pinned examples.",
  },
  {
    id: "spacer-tree-sitter-cross-attention-1",
    name: "Spacer Tree-Sitter Cross-Attention v1",
    family: "attention",
    tokenizer: {
      key: "compact",
      label:
        "Hybrid v1 · cl100k_base BPE (128/side, 5 lines) + Tree-Sitter compact schema 2 (64/side)",
    },
    directory: "tmp/spacer-tree-sitter-cross-attention-1",
    description:
      "3.61M-parameter lexical–syntax cross-attention model, seed 42. Held-out accuracy 92.49% versus matched Lines 92.22%. Higher accuracy but slower CPU inference. Trained on TypeScript/TSX; cross-language accuracy is unmeasured. Inspect compact syntax here and BPE via the inspector's BPE view.",
  },
  {
    id: "spacer-lines-1-ts",
    name: "Spacer Lines v1 TypeScript",
    family: "lines",
    tokenizer: modelTokenizers.bpe,
    directory: "tmp/spacer-lines-ts",
    description:
      "Line-wise BPE text tokens preserve spelling, punctuation and literals. Trained on TypeScript/TSX; also runs on other supported languages using Tree-sitter spacing boundaries. Cross-language accuracy is unmeasured.",
  },
  {
    id: "spacer-tree-sitter-bytes-1",
    name: "Spacer Tree-Sitter Bytes v1",
    family: "tree",
    directory: "tmp/spacer-tree-sitter",
    tokenizer: modelTokenizers.bytes,
    description:
      "Original 72K-parameter CNN. Universal syntax tokens with normalized identifier UTF-8 bytes; five training epochs.",
  },
  {
    id: "spacer-tree-sitter-bytes-long-1",
    name: "Spacer Tree-Sitter Bytes Long v1",
    family: "tree",
    directory: "tmp/tree-tuning/long-baseline-seed42",
    tokenizer: modelTokenizers.bytes,
    description:
      "Same tiny byte-based CNN, trained longer with AdamW and learning-rate scheduling. Selected epoch 18.",
  },
  {
    id: "spacer-tree-sitter-bytes-wide-1",
    name: "Spacer Tree-Sitter Bytes Wide v1",
    family: "tree",
    directory: "tmp/tree-tuning/wide-seed42",
    tokenizer: modelTokenizers.bytes,
    description:
      "Wider 1.20M-parameter byte-based CNN, testing increased capacity. Selected epoch 4.",
  },
  {
    id: "spacer-tree-sitter-contextual-1",
    name: "Spacer Tree-Sitter Contextual v1",
    family: "tree",
    directory: "tmp/tree-tuning/contextual-seed42",
    tokenizer: modelTokenizers.bytes,
    description:
      "2.04M-parameter byte-based CNN with dilated layers and contextual features for longer-range interactions.",
  },
  ...[42, 123, 2026].map((seed) => ({
    id: `spacer-tree-sitter-regularized-seed${seed}-1`,
    name: `Spacer Tree-Sitter Regularized Seed${seed} v1`,
    family: "tree",
    directory: `tmp/tree-tuning/contextual-regularized-seed${seed}`,
    tokenizer: modelTokenizers.bytes,
    description: `Contextual CNN with stronger dropout and weight decay, seed ${seed}. Validation-selected checkpoint; individual test quality not measured.`,
  })),
  {
    id: "spacer-tree-sitter-ensemble-1",
    name: "Spacer Tree-Sitter Ensemble v1",
    family: "tree",
    directory: "tmp/tree-tuning/ensemble",
    tokenizer: modelTokenizers.bytes,
    description:
      "Averages three regularized contextual CNNs. Best validation loss in the original byte-tokenizer search, with larger weights and slower CPU inference.",
  },
  {
    id: "spacer-tree-sitter-compact-1",
    name: "Spacer Tree-Sitter Compact v1",
    family: "tree",
    directory: "tmp/spacer-tree-sitter-compact",
    tokenizer: modelTokenizers.compact,
    description:
      "72K-parameter CNN using IDENTIFIER + local ID pairs. Repeated normalized names share IDs across the gap, fitting more structure into the context.",
  },
];
export const defaultModel = "spacer-lines-1-ts";
