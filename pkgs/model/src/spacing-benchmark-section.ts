import { readFile } from "node:fs/promises";

export async function spacingBenchmarkSection() {
  const root = "docs/benchmark-data/spacing-context-v1";
  const load = async (name: string) => JSON.parse(await readFile(`${root}/${name}.json`, "utf8"));
  const [complete, training, sequential] = await Promise.all([
    load("complete"), load("training"), load("sequential-validation"),
  ]);
  if (!complete.complete || !sequential.complete) throw new Error("Spacing-context campaign incomplete");
  const pct = (value: number) => (100 * value).toFixed(2);
  const keys = ["typescript/original", "rust/original", "typescript/stripped", "rust/stripped"];
  const labels = ["TS original", "Rust original", "TS stripped", "Rust stripped"];
  const chart = (metric: string, title: string) => `\`\`\`mermaid
xychart-beta horizontal
  title "Sequential validation — ${title}"
  x-axis [${labels.map(label => JSON.stringify(label)).join(", ")}]
  y-axis "%" 0 --> 100
  bar [${keys.map(key => pct(sequential.metrics[key][metric])).join(", ")}]
\`\`\``;
  return { complete, training, sequential, markdown: `## Sequential cross-attention — surrounding spacing and all-line boundaries

**New playground release:** Spacer Sequential Cross-Attention v1 Rust + TypeScript (\`spacer-tree-sitter-spacing-context-1\`). One 3,613,761-parameter bilingual model, trained from scratch on **64,039,150 boundaries**. Training stopped after 12 epochs; epoch 5 was selected by minimum validation loss. The frozen shared threshold is **0.47**.

At each safe inter-line gap, the model hides the entire current gap, retains internal blank lines in the five-nonempty-line context blocks, and predicts top-to-bottom. Earlier model decisions become context for later predictions; future context keeps its input spacing. Protected literal/comment interiors remain untouched. This trained behavior is always enabled, independently of the playground's experimental checkbox for older models.

**Sequential validation, not a new held-out test:** 100 TS and 100 Rust validation files selected deterministically by file hash, restricted to 1–512 eligible boundaries/file. The same files and original labels are used in both conditions. “Stripped” removes blank lines only at eligible gaps before formatting; protected content stays intact.

| Input condition | Language | Boundaries | Accuracy | F1 | Precision | Recall |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${keys.map(key => {
    const m = sequential.metrics[key];
    return `| ${key.endsWith("/original") ? "Original spacing" : "Eligible gaps stripped"} | ${key.startsWith("rust") ? "Rust" : "TS"} | ${m.examples.toLocaleString("en-US")} | ${pct(m.accuracy)}% | ${pct(m.f1)}% | ${pct(m.precision)}% | ${pct(m.recall)}% |`;
  }).join("\n")}

${chart("accuracy", "accuracy")}

${chart("f1", "F1")}

Surrounding spacing helps on this sample, particularly TS: F1 falls from **84.38% to 78.62%** when eligible input gaps are stripped (Rust: **87.92% to 86.07%**). This is not a controlled comparison against the earlier architecture/checkpoints. Many newly admitted gaps correctly need no blank line, so the ~96–97% accuracy **must not be compared directly with the older ~88% sibling-boundary results**.

Full teacher-forced validation uses original surrounding context rather than previous model decisions: **${training.config.validation.examples.toLocaleString("en-US")} boundaries**, **${pct(training.config.validation.accuracy)}% accuracy / ${pct(training.config.validation.f1)}% F1** overall. Per-language accuracy/F1: **${pct(training.config.byLanguage.typescript.accuracy)}% / ${pct(training.config.byLanguage.typescript.f1)}% TS**, **${pct(training.config.byLanguage.rust.accuracy)}% / ${pct(training.config.byLanguage.rust.f1)}% Rust**. These are separate measurements from the sequential sample above.

Release: \`spacer-models/models/tree-sitter-spacing-context-1/\`. Export parity passed (maximum probability difference **2.69×10⁻⁷**). [Bucket read-back verification](benchmark-data/spacing-context-v1/release-verification.json), [training history](benchmark-data/spacing-context-v1/training.json), [sequential results](benchmark-data/spacing-context-v1/sequential-validation.json), [protocol](research/spacing-context-v1.md). The legacy test partition was not reopened by this campaign.
` };
}
