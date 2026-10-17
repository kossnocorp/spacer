import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { cpus, platform, arch, totalmem } from "node:os";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import type { Tensor } from "@tensorflow/tfjs-node";
import { prepare } from "@spcr/playground";
import {
  tokenize,
  languageFor,
  encodeContext,
  encodeLegacyContext,
  prepareDocument,
  renderDocument,
  closeParsers,
  type Event,
} from "@spcr/tree-sitter";
import { models } from "./catalog.ts";
import { jsonLines, hash, windows, type Example } from "./data.ts";
import { encodePair } from "./tokenizer.ts";
import { metrics } from "./metrics.ts";
import { LocalSpacer } from "./predict.ts";
import { TreeSpacer } from "./tree-predict.ts";
import { tf } from "./runtime.ts";

const { values } = parseArgs({
  options: {
    files: { type: "string", default: "50" },
    repeats: { type: "string", default: "3" },
    corpus: { type: "string", default: "tmp/model-corpus-ordered" },
    "repos-root": { type: "string", default: "tmp" },
  },
});
const fileLimit = Number(values.files),
  repeats = Number(values.repeats);
for (const [key, value] of [
  ["files", fileLimit],
  ["repeats", repeats],
] as const)
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${key} must be a positive integer`);

const measuredAt = new Date().toISOString();
const runDirectory = join(
  "reports/benchmarks",
  measuredAt.replaceAll(":", "-"),
);
await mkdir(runDirectory, { recursive: true });
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const median = (numbers: number[]) => {
  const sorted = [...numbers].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const percentile95 = (numbers: number[]) =>
  [...numbers].sort((a, b) => a - b)[Math.ceil(numbers.length * 0.95) - 1]!;
const environment = {
  node: process.version,
  tensorflow: tf.version,
  platform: platform(),
  arch: arch(),
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  memoryBytes: totalmem(),
  threads: {
    intra: process.env.TF_NUM_INTRAOP_THREADS,
    inter: process.env.TF_NUM_INTEROP_THREADS,
    omp: process.env.OMP_NUM_THREADS,
  },
};
type FileRow = { file: string; split: string; afterHash: string };
type Input = {
  file: string;
  source: string;
  filename: string;
  events: Event[];
  examples: Example[];
};
const inputs: Input[] = [];
const excluded: { file: string; reason: string }[] = [];
const candidates: FileRow[] = [];
const manifestRaw = await readFile(
  join(values.corpus, "manifest.json"),
  "utf8",
);
const corpus = JSON.parse(manifestRaw);
for await (const row of jsonLines<FileRow>(join(values.corpus, "files.jsonl")))
  if (row.split === "eval") candidates.push(row);
candidates.sort((a, b) =>
  hash(`benchmark-v1:${a.file}`).localeCompare(hash(`benchmark-v1:${b.file}`)),
);
// Membership is fixed before looking at labels or model predictions.
const selected = candidates.slice(0, fileLimit);
if (selected.length !== fileLimit)
  throw new Error("Insufficient validation files");
const rows = new Map(selected.map((row) => [row.file, [] as Example[]]));
console.log(
  `Collecting validation examples for ${fileLimit} deterministic files…`,
);
for await (const example of jsonLines<Example>(
  join(values.corpus, "eval.jsonl"),
))
  rows.get(example.file)?.push(example);

try {
  for (const row of selected) {
    const [owner, repo, ...parts] = row.file.split("/");
    const filename = join(values["repos-root"], `${owner}--${repo}`, ...parts);
    const source = await readFile(filename, "utf8");
    if (hash(source) !== row.afterHash)
      throw new Error(`Corpus source changed: ${row.file}`);
    const examples = rows.get(row.file)!;
    if (!examples.length) {
      excluded.push({ file: row.file, reason: "No retained corpus examples" });
      continue;
    }
    const prepared = await prepare(filename, source);
    // Check alignment against stored windows before creating any model inputs.
    for (const example of examples) {
      const context = windows(prepared.lines, example.boundary, corpus.context);
      if (context.before !== example.before || context.after !== example.after)
        throw new Error(`Corpus context mismatch: ${example.id}`);
    }
    let events: Event[];
    try {
      events = await tokenize(
        prepared.lines.join("\n"),
        languageFor(filename)!,
      );
      await prepareDocument(source, filename);
    } catch (error) {
      excluded.push({ file: row.file, reason: String(error) });
      continue;
    }
    inputs.push({ file: row.file, filename, source, events, examples });
  }
} finally {
  await closeParsers();
}
if (!inputs.length) throw new Error("No comparable validation inputs");
const examples = inputs.flatMap((input) =>
  input.examples.map((example) => ({ example, events: input.events })),
);
const labels = examples.map(({ example }) => example.label);
const original = examples.map(({ example }) => example.originalLabel);
const lines = inputs.reduce(
  (sum, input) =>
    sum + input.source.split("\n").length - Number(input.source.endsWith("\n")),
  0,
);
const provenance = {
  corpus: values.corpus,
  corpusManifestSha256: hash(manifestRaw),
  split: "eval",
  sampleSeed: "benchmark-v1",
  requestedFiles: fileLimit,
  files: inputs.length,
  examples: examples.length,
  lines,
  excluded,
  inputs: inputs.map((input) => ({
    file: input.file,
    sha256: hash(input.source),
    examples: input.examples.length,
  })),
  exampleIdsSha256: hash(examples.map(({ example }) => example.id).join("\n")),
};
console.log(
  `Matched sample: ${inputs.length} files, ${examples.length} boundaries; ${excluded.length} exclusions.`,
);
const results: {
  id: string;
  name: string;
  parameters: number;
  weightsBytes: number;
  weightsSha256: string;
  configSha256: string;
  modelSha256: string;
  quality: ReturnType<typeof metrics>;
  runs: {
    loadMs: number;
    elapsedMs: number;
    locPerSecond: number;
    p95FileMs: number;
  }[];
}[] = [];
const save = async () =>
  writeFile(
    join(runDirectory, "results.json"),
    JSON.stringify({ measuredAt, environment, provenance, results }, null, 2) +
      "\n",
  );
await save();
for (let repeat = 0; repeat < repeats; repeat++) {
  // Rotate order between repeats to reduce systematic first/last-model effects.
  const offset = repeat % models.length;
  const order = [...models.slice(offset), ...models.slice(0, offset)];
  for (const entry of order) {
    console.log(`[${repeat + 1}/${repeats}] ${entry.name}`);
    const root = resolve(entry.directory);
    const configRaw = await readFile(join(root, "config.json"), "utf8");
    const weights = await readFile(join(root, "best/weights.bin"));
    const modelRaw = await readFile(join(root, "best/model.json"));
    const config = JSON.parse(configRaw);
    const startedLoad = performance.now();
    const model =
      entry.family === "lines"
        ? await LocalSpacer.load(root)
        : await TreeSpacer.load(root);
    const loadMs = performance.now() - startedLoad;
    try {
      let result = results.find((result) => result.id === entry.id);
      if (!result) {
        if (model instanceof LocalSpacer && model.context !== corpus.context)
          throw new Error("Lines context differs from corpus");
        const scores: number[] = [];
        const n = model.tokensPerSide;
        for (let start = 0; start < examples.length; start += 512) {
          const batch = examples.slice(start, start + 512);
          const left = new Int32Array(batch.length * n),
            right = new Int32Array(batch.length * n);
          batch.forEach(({ example, events }, i) => {
            const tokens =
              model instanceof LocalSpacer
                ? encodePair(example.before, example.after, n).values
                : (model.tokenizerSchema === 1
                    ? encodeLegacyContext
                    : encodeContext)(events, example.boundary, n);
            left.set(tokens.subarray(0, n), i * n);
            right.set(tokens.subarray(n), i * n);
          });
          const tensors = [
            tf.tensor2d(left, [batch.length, n], "int32"),
            tf.tensor2d(right, [batch.length, n], "int32"),
          ];
          let prediction: Tensor | undefined;
          try {
            prediction = model.model.predict(tensors) as Tensor;
            scores.push(...(await prediction.data()));
          } finally {
            tf.dispose(tensors);
            prediction?.dispose();
          }
        }
        result = {
          id: entry.id,
          name: entry.name,
          parameters: model.model.countParams(),
          weightsBytes: weights.length,
          weightsSha256: digest(weights),
          configSha256: hash(configRaw),
          modelSha256: digest(modelRaw),
          quality: metrics(labels, scores, config.threshold),
          runs: [],
        };
        results.push(result);
      } else if (
        result.weightsSha256 !== digest(weights) ||
        result.configSha256 !== hash(configRaw) ||
        result.modelSha256 !== digest(modelRaw)
      ) {
        throw new Error(`Model changed during benchmark: ${entry.id}`);
      }
      const format = async (input: Input) => {
        const document = await prepareDocument(input.source, input.filename);
        const scores =
          model instanceof LocalSpacer
            ? await model.scoreDocument(document)
            : await model.score(document);
        await renderDocument(document, scores, model.threshold);
      };
      await format(inputs[0]!); // Warm model and parser, outside measured work.
      const durations: number[] = [],
        started = performance.now();
      for (const input of inputs) {
        const before = performance.now();
        await format(input);
        durations.push(performance.now() - before);
      }
      const elapsedMs = performance.now() - started;
      result.runs.push({
        loadMs,
        elapsedMs,
        locPerSecond: (lines * 1000) / elapsedMs,
        p95FileMs: percentile95(durations),
      });
      console.log(
        `  accuracy ${(result.quality.accuracy * 100).toFixed(2)}%, F1 ${(result.quality.f1 * 100).toFixed(2)}%; ${Math.round((lines * 1000) / elapsedMs)} LOC/s`,
      );
      await save();
    } finally {
      model.dispose();
      await closeParsers();
    }
  }
}
results.sort(
  (a, b) =>
    models.findIndex((model) => model.id === a.id) -
    models.findIndex((model) => model.id === b.id),
);
await save();
const percent = (n: number) => (n * 100).toFixed(2);
const baseline = metrics(labels, original, 0.5);
const table = results
  .map(
    (result, i) =>
      `| M${i + 1} | ${result.name} | ${percent(result.quality.accuracy)} | ${percent(result.quality.f1)} | ${result.quality.logLoss.toFixed(4)} | ${result.quality.threshold} | ${Math.round(median(result.runs.map((run) => run.locPerSecond))).toLocaleString("en-US")} | ${median(result.runs.map((run) => run.p95FileMs)).toFixed(1)} | ${median(result.runs.map((run) => run.loadMs)).toFixed(1)} | ${(result.weightsBytes / 1048576).toFixed(2)} |`,
  )
  .join("\n");
const chart = (title: string, axis: string, numbers: number[], range = "") =>
  `\`\`\`mermaid\nxychart-beta\n  title "${title}"\n  x-axis [${results.map((_, i) => `M${i + 1}`).join(", ")}]\n  y-axis "${axis}"${range ? ` ${range}` : ""}\n  bar [${numbers.join(", ")}]\n\`\`\``;
const markdown = `# Model benchmark

Generated ${measuredAt} by \`mise benchmark\`. All ${results.length} local catalog models; no hosted API calls.

## Results

**Validation teacher agreement, not held-out test accuracy.** ${inputs.length} TypeScript/TSX files, ${examples.length.toLocaleString("en-US")} identical labeled boundaries. Saved thresholds; no calibration or model selection in this task.

| Chart ID | Model | Accuracy % | F1 % | Log loss | Threshold | LOC/s | p95 file ms | Load ms | Weights MiB |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${table}

${chart(
  "Validation accuracy",
  "Accuracy (%)",
  results.map((result) => Number(percent(result.quality.accuracy))),
  "0 --> 100",
)}

${chart(
  "CPU formatting throughput",
  "LOC/s",
  results.map((result) =>
    Math.round(median(result.runs.map((run) => run.locPerSecond))),
  ),
)}

Chart IDs follow the table. Original-spacing baseline: **${percent(baseline.accuracy)}% accuracy**, **${percent(baseline.f1)}% F1**; always-no-blank accuracy: **${percent(labels.filter((label) => label === 0).length / labels.length)}%**.

## Methodology

- Deterministic hash-ranked sample of ${fileLimit} files from the existing file-group validation split (seed \`benchmark-v1\`); ${excluded.length} exclusions are recorded in raw results. No test split is opened. The validation split has already informed historical training/selection.
- All models score exactly the same retained corpus examples, using their own tokenizers. Source hashes and stored context windows are verified. Accuracy preparation matches corpus normalization; no tokenizer-specific deduplication or model-dependent sample selection is applied. This sample is not directly comparable to historical full-test metrics, and encoded-context overlap across file splits is not re-filtered here.
- Accuracy measures agreement with existing teacher-derived spacing labels, not independent human judgments. Cross-language accuracy is unmeasured. The positive class is a blank line.
- Performance: ${repeats} sequential CPU runs per model, rotating model order. Median LOC/s and load time; median of per-run nearest-rank p95 file latency. ${lines.toLocaleString("en-US")} source lines per run, including blank lines. One file warm-up per run; load and warm-up excluded from throughput.
- Full playground-style formatting: Tree-sitter parsing, model tokenization/scoring, and syntax-preserving rendering for every model, including Lines. Sources are preloaded; no disk I/O, HTTP, output writes, or oxfmt in measured formatting. Accuracy scoring time is not included. These sampled files may have different sizes; p95 is file latency, not per-boundary latency.
- CPU: ${environment.cpu}; ${environment.logicalCpus} logical CPUs; ${environment.platform}/${environment.arch}; Node ${environment.node}; TensorFlow.js ${tf.version.tfjs}. Thread pools: intra=${environment.threads.intra}, inter=${environment.threads.inter}, OMP=${environment.threads.omp}. Shared-machine load can affect timings.

## Reproduce

Run from the repository root:

\`\`\`sh
mise benchmark
# Larger sample / more repetitions:
mise run benchmark -- --files 200 --repeats 5
\`\`\`

Requires all catalog model artifacts under \`tmp/\`, the completed \`tmp/model-corpus-ordered\` corpus, and its hash-matching repository checkouts. Missing artifacts or changed sources fail the run. Optional \`--corpus\` and \`--repos-root\` select alternative locations.

Raw metrics (including confusion matrices, precision/recall and calibration metrics), per-repeat timings, input hashes, model/config hashes, environment and exclusions: [results.json](../${runDirectory}/results.json). Each run has a new directory; previous benchmark artifacts are retained. This document is replaced only after a successful complete run.
`;
await mkdir("docs", { recursive: true });
await writeFile(join(runDirectory, "benchmark.md"), markdown);
await writeFile("docs/benchmark.md.tmp", markdown);
await rename("docs/benchmark.md.tmp", "docs/benchmark.md");
console.log(`Wrote docs/benchmark.md and ${runDirectory}/results.json`);
