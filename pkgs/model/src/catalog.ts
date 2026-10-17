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
      "Averages three regularized contextual CNNs. Best measured tree-model quality, with larger weights and slower CPU inference.",
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
