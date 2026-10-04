import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { tf } from "./runtime.ts";
import { loadData, predictData } from "./batches.ts";
import { metrics } from "./metrics.ts";
import { hash } from "./data.ts";

const { values } = parseArgs({
  options: {
    data: { type: "string", default: "tmp/model-encoded" },
    model: { type: "string", default: "tmp/model-run" },
    split: { type: "string", default: "test" },
    "batch-size": { type: "string", default: "512" },
  },
});
if (!["test", "eval"].includes(values.split))
  throw new Error("split must be test or eval");
const batchSize = Number(values["batch-size"]);
if (!Number.isSafeInteger(batchSize) || batchSize < 1)
  throw new Error("batch-size must be a positive integer");
const root = resolve(values.model),
  dataRoot = resolve(values.data);
const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
if (
  hash(await readFile(join(dataRoot, "manifest.json"), "utf8")) !==
  config.encodedManifestHash
)
  throw new Error("Encoded corpus differs from the training run");
const model = await tf.loadLayersModel(
  pathToFileURL(join(root, "best/model.json")).href,
);
const prediction = await predictData(
  model,
  await loadData(dataRoot, values.split),
  batchSize,
);
const changedLabels: number[] = [],
  changedScores: number[] = [];
for (let i = 0; i < prediction.labels.length; i++)
  if (prediction.labels[i] !== prediction.originals[i]) {
    changedLabels.push(prediction.labels[i]);
    changedScores.push(prediction.scores[i]);
  }
const report = {
  split: values.split,
  evaluatedAt: new Date().toISOString(),
  thresholdWasFixedBeforeTest: true,
  corpusManifestHash: config.corpusManifestHash,
  bestEpoch: config.bestEpoch,
  model: metrics(prediction.labels, prediction.scores, config.threshold),
  onChangedBoundaries: changedLabels.length
    ? metrics(changedLabels, changedScores, config.threshold)
    : null,
  preserveOriginalBaseline: metrics(
    prediction.labels,
    prediction.originals,
    0.5,
  ),
  alwaysNoBaseline: metrics(
    prediction.labels,
    new Float32Array(prediction.labels.length),
    0.5,
  ),
};
await writeFile(
  join(root, `${values.split}-report.json`),
  JSON.stringify(report, null, 2),
);
model.dispose();
console.log(JSON.stringify(report, null, 2));
