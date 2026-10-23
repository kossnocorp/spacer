// Validation-only sequential evaluation; never opens encoded test records.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AttentionSpacer } from "./attention-predict.ts";
import { jsonLines } from "./data.ts";
import { metrics } from "./metrics.ts";
import {
  prepareDocument,
  renderDocument,
  closeParsers,
  languageFor,
} from "@spcr/tree-sitter";

const report = "docs/benchmark-data/spacing-context-v1";
const model = await AttentionSpacer.load(
  "tmp/spacer-tree-sitter-spacing-context-1",
);
if (model.contextMode !== "spacing-context-v1")
  throw new Error("Wrong context contract");
type File = {
  filename: string;
  sha256: string;
  group: string;
  split: string;
  boundaries: number;
};
const files: File[] = [];
for await (const file of jsonLines<File>(
  "tmp/encoded-spacing-context-v1/files.jsonl",
)) {
  if (file.split === "eval" && file.boundaries > 0 && file.boundaries <= 512)
    files.push(file);
}
files.sort((a, b) => a.group.localeCompare(b.group));
const selected = ["typescript", "rust"].flatMap((language) =>
  files
    .filter(
      (f) =>
        (languageFor(f.filename) === "rust" ? "rust" : "typescript") ===
        language,
    )
    .slice(0, 100),
);
const plan = {
  selection:
    "First 100 file hashes per language from validation, 1–512 eligible boundaries",
  files: selected,
  threshold: model.threshold,
};
await writeFile(
  `${report}/sequential-plan.json`,
  JSON.stringify(plan, null, 2) + "\n",
);
const results: Record<string, { labels: number[]; scores: number[] }> = {};
const perFile = [];
try {
  for (const file of selected) {
    const bytes = await readFile(file.filename);
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw new Error("Source changed");
    const original = await prepareDocument(
      bytes.toString("utf8"),
      file.filename,
      undefined,
      true,
    );
    const labels = original.boundaries.map((gap) => Number(gap.existing));
    for (const mode of ["original", "stripped"] as const) {
      const source =
        mode === "original"
          ? original.source
          : await renderDocument(
              original,
              labels.map(() => 0),
              model.threshold,
            );
      const doc = await prepareDocument(source, file.filename, undefined, true);
      if (doc.boundaries.length !== labels.length)
        throw new Error("Boundary alignment changed");
      const start = performance.now();
      const scores = await model.score(doc);
      await renderDocument(doc, scores, model.threshold); // Full syntax-preserving rendering verification.
      const language =
        languageFor(file.filename) === "rust" ? "rust" : "typescript";
      const key = `${language}/${mode}`;
      const aggregate = (results[key] ??= { labels: [], scores: [] });
      aggregate.labels.push(...labels);
      aggregate.scores.push(...scores);
      perFile.push({
        filename: file.filename,
        language,
        mode,
        elapsedMs: performance.now() - start,
        metrics: metrics(labels, scores, model.threshold),
      });
    }
    console.log(
      `Sequential validation ${perFile.length / 2}/${selected.length}: ${file.filename}`,
    );
  }
  await writeFile(
    `${report}/sequential-validation.json`,
    JSON.stringify(
      {
        complete: true,
        plan,
        methodology:
          "Top-to-bottom, current gap hidden; original labels; validation only; includes all admitted boundaries in sampled files, including contexts deduplicated by training encoder",
        metrics: Object.fromEntries(
          Object.entries(results).map(([key, value]) => [
            key,
            metrics(value.labels, value.scores, model.threshold),
          ]),
        ),
        perFile,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  model.dispose();
  await closeParsers();
}
