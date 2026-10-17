// Throughput only: no test labels or model selection.
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { jsonLines } from "./data.ts";
import { TreeSpacer } from "./tree-predict.ts";
import { prepareDocument, closeParsers } from "@spcr/tree-sitter";

const { values } = parseArgs({ options: {
  baseline: { type: "string", default: "tmp/spacer-tree-sitter" },
  model: { type: "string", default: "tmp/spacer-tree-sitter-compact" },
  out: { type: "string", default: "reports/tree-compact/throughput.json" },
} });
const candidates: { path: string; hash: string }[] = [];
for await (const row of jsonLines<{ file: string; split: string }>("tmp/model-corpus-ordered/files.jsonl")) {
  if (row.split !== "train") continue;
  const [owner, repo, ...parts] = row.file.split("/");
  candidates.push({ path: join("tmp", `${owner}--${repo}`, ...parts),
    hash: createHash("sha256").update(`speed-v1:${row.file}`).digest("hex") });
}
candidates.sort((a, b) => a.hash.localeCompare(b.hash));
const paths: string[] = [], excluded: string[] = [];
try {
  for (const { path } of candidates) {
    try {
      await prepareDocument(await readFile(path, "utf8"), path);
      paths.push(path);
    } catch { excluded.push(path); }
    if (paths.length === 1000) break;
  }
} finally { await closeParsers(); }
if (paths.length !== 1000) throw new Error("Insufficient benchmark files");
const models = { baseline: values.baseline, compact: values.model };
const throughput = [];
for (let repeat = 0; repeat < 3; repeat++) {
  const order = Object.entries(models);
  if (repeat % 2) order.reverse();
  for (const [name, root] of order) {
    const startedLoad = performance.now();
    const model = await TreeSpacer.load(root);
    const loadMs = performance.now() - startedLoad;
    let bytes = 0, lines = 0;
    const hash = createHash("sha256"), started = performance.now();
    try {
      for (const path of paths) {
        const source = await readFile(path, "utf8");
        bytes += Buffer.byteLength(source);
        lines += source.split("\n").length - Number(source.endsWith("\n"));
        hash.update(source);
        await model.format(source, path);
      }
      const elapsedMs = performance.now() - started;
      const result = { name, repeat, files: paths.length, bytes, lines,
        sourceSha256: hash.digest("hex"), loadMs, elapsedMs,
        locPerSecond: lines * 1000 / elapsedMs };
      throughput.push(result);
      console.log(JSON.stringify(result));
    } finally { model.dispose(); await closeParsers(); }
  }
}
if (new Set(throughput.map(r => r.sourceSha256)).size !== 1)
  throw new Error("Benchmark sources changed between runs");
const sizes = {} as Record<string, { parameters: number; weightsBytes: number }>;
for (const [name, root] of Object.entries(models)) {
  const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
  sizes[name] = { parameters: config.parameters, weightsBytes: (await stat(join(root, "best/weights.bin"))).size };
}
await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, JSON.stringify({ measuredAt: new Date().toISOString(), models, sizes,
  throughput, paths, excluded,
  methodology: "CPU, identical hash-sampled training files; three alternating-order repeats. Full formatting including reads and syntax verification; model load reported separately; no output writes or test evaluation."
}, null, 2) + "\n");
