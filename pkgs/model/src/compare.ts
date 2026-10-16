import { readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { tf } from "./runtime.ts";
import { loadData, predictData } from "./batches.ts";
import { metrics } from "./metrics.ts";
import { jsonLines } from "./data.ts";
import { LocalSpacer } from "./predict.ts";
import { TreeSpacer } from "./tree-predict.ts";
import { prepareDocument, closeParsers } from "@spcr/tree-sitter";

const { values } = parseArgs({
  options: {
    lines: { type: "string", default: "tmp/spacer-lines-ts" },
    tree: { type: "string", default: "tmp/spacer-tree-sitter" },
    data: { type: "string", default: "tmp/model-encoded-tree-sitter" },
    corpus: { type: "string", default: "tmp/model-corpus-ordered" },
    files: { type: "string", default: "1000" },
    out: { type: "string", default: "reports/tree-sitter/comparison.json" },
  },
});
const limit = Number(values.files);
if (!Number.isSafeInteger(limit) || limit < 1)
  throw new Error("files must be positive");
const quality: Record<string, unknown> = {};
for (const [name, root, data] of [
  ["spacer-lines-ts", values.lines, join(values.data, "lines-reference")],
  ["spacer-tree-sitter", values.tree, values.data],
]) {
  const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
  const model = await tf.loadLayersModel(
    pathToFileURL(resolve(root, "best/model.json")).href,
  );
  try {
    const prediction = await predictData(
      model,
      await loadData(data, "test"),
      512,
    );
    quality[name] = {
      ...metrics(prediction.labels, prediction.scores, config.threshold),
      parameters: model.countParams(),
      weightsBytes: (await stat(join(root, "best/weights.bin"))).size,
    };
  } finally {
    model.dispose();
  }
}
const paths: string[] = [],
  rejected: string[] = [];
for await (const row of jsonLines<{ file: string; split: string }>(
  join(values.corpus, "files.jsonl"),
)) {
  if (row.split !== "test") continue;
  const [owner, repo, ...parts] = row.file.split("/");
  const path = join("tmp", `${owner}--${repo}`, ...parts);
  try {
    await prepareDocument(await readFile(path, "utf8"), path);
    paths.push(path);
  } catch {
    rejected.push(row.file);
  }
  if (paths.length === limit) break;
}
await closeParsers();
const throughput: Record<string, unknown> = {};
for (const [name, root] of [
  ["spacer-lines-ts", values.lines],
  ["spacer-tree-sitter", values.tree],
]) {
  const startedLoad = performance.now();
  const model =
    name === "spacer-lines-ts"
      ? await LocalSpacer.load(resolve(root))
      : await TreeSpacer.load(resolve(root));
  const loadMs = performance.now() - startedLoad;
  let bytes = 0,
    lines = 0;
  const hash = createHash("sha256");
  const started = performance.now();
  try {
    for (const path of paths) {
      const source = await readFile(path, "utf8");
      bytes += Buffer.byteLength(source);
      lines += source.split("\n").length - Number(source.endsWith("\n"));
      hash.update(source);
      if (model instanceof TreeSpacer) await model.format(source, path);
      else await model.formatSource(source, path);
    }
    const elapsedMs = performance.now() - started;
    throughput[name] = {
      files: paths.length,
      bytes,
      lines,
      sourceSha256: hash.digest("hex"),
      loadMs,
      elapsedMs,
      bytesPerSecond: (bytes * 1000) / elapsedMs,
      locPerSecond: (lines * 1000) / elapsedMs,
    };
  } finally {
    model.dispose();
    await closeParsers();
  }
}
const report = {
  measuredAt: new Date().toISOString(),
  quality,
  throughput,
  rejected,
  methodology:
    "Quality: identical held-out boundary targets; each tokenizer uses its own inputs and validation-selected threshold. Throughput: identical files, sequential full formatting including reads and syntax verification, no writes; model load reported separately. Tree training labels are TypeScript only. Grammar compatibility is not evidence of cross-language spacing quality.",
};
await writeFile(values.out, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
