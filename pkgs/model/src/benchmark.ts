import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { cpus } from "node:os";
import { createHash } from "node:crypto";
import { prepare, render, parallel, type Prepared } from "@spcr/playground";
import { LocalSpacer } from "./predict.ts";
import { jsonLines } from "./data.ts";

const { values } = parseArgs({
  options: {
    model: { type: "string", default: "tmp/model-rocm" },
    corpus: { type: "string", default: "tmp/model-corpus" },
    "repos-root": { type: "string", default: "tmp" },
    out: { type: "string", default: "tmp/model-rocm/benchmark.json" },
  },
});
const paths: string[] = [];
for await (const row of jsonLines<{ file: string; split: string }>(
  join(values.corpus, "files.jsonl"),
)) {
  if (row.split !== "test") continue;
  const [owner, repo, ...path] = row.file.split("/");
  paths.push(join(values["repos-root"], `${owner}--${repo}`, ...path));
}
if (!paths.length) throw new Error("No held-out files found");
const loadStart = performance.now();
const local = await LocalSpacer.load(resolve(values.model));
const loadMs = performance.now() - loadStart;
let bytes = 0,
  lines = 0,
  boundaries = 0,
  outputBytes = 0;
let prepareMs = 0,
  scoreMs = 0,
  renderMs = 0;
const fingerprint = createHash("sha256");
const started = performance.now();
try {
  // Match format.ts: 32 files per group, preparation concurrency 8, inference batch 512.
  for (let start = 0; start < paths.length; start += 32) {
    const files: Prepared[] = [];
    let stage = performance.now();
    await parallel(paths.slice(start, start + 32), 8, async (path, index) => {
      const source = await readFile(path, "utf8");
      files[index] = await prepare(path, source);
    });
    prepareMs += performance.now() - stage;
    for (const file of files) {
      bytes += Buffer.byteLength(file.original);
      lines +=
        file.original.length === 0
          ? 0
          : file.original.split("\n").length -
            Number(file.original.endsWith("\n"));
      boundaries += file.boundaries.length;
      fingerprint.update(file.original);
    }
    stage = performance.now();
    await local.score(files, 512);
    scoreMs += performance.now() - stage;
    stage = performance.now();
    for (const file of files)
      outputBytes += Buffer.byteLength(render(file, local.threshold * 100));
    renderMs += performance.now() - stage;
  }
  const elapsedMs = performance.now() - started;
  const rate = (ms: number) => ({
    bytesPerSecond: bytes / (ms / 1000),
    locPerSecond: lines / (ms / 1000),
  });
  const report = {
    measuredAt: new Date().toISOString(),
    model: values.model,
    backend: "TensorFlow.js native CPU (ROCm-trained weights)",
    node: process.version,
    cpu: cpus()[0]?.model,
    files: paths.length,
    bytes,
    lines,
    boundaries,
    outputBytes,
    source:
      "Current working-tree versions of all held-out files; no files written",
    sourceSha256: fingerprint.digest("hex"),
    locDefinition:
      "Physical input lines, including blank lines and comments; trailing newline is not an extra line",
    timing:
      "Fresh process/tokenizer cache; includes reads, oxfmt, syntax analysis, tokenization, inference, rendering; excludes module startup and output writes",
    loadMs,
    prepareMs,
    scoreMs,
    renderMs,
    elapsedMs,
    fullPipeline: rate(elapsedMs),
    includingModelLoad: rate(elapsedMs + loadMs),
    scoringAndTokenization: rate(scoreMs),
  };
  await writeFile(values.out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  local.dispose();
}
