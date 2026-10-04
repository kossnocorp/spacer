import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { tf } from "./runtime.ts";
import { buildModel } from "./network.ts";
import { loadData, batch, shuffle, predictData } from "./batches.ts";
import { metrics, chooseThreshold } from "./metrics.ts";
import { hash } from "./data.ts";

const { values } = parseArgs({
  options: {
    data: { type: "string", default: "tmp/model-encoded" },
    out: { type: "string", default: "tmp/model-run" },
    epochs: { type: "string", default: "5" },
    "batch-size": { type: "string", default: "512" },
    patience: { type: "string", default: "2" },
    seed: { type: "string", default: "42" },
  },
});
const dataRoot = resolve(values.data),
  out = resolve(values.out);
const epochs = Number(values.epochs),
  batchSize = Number(values["batch-size"]),
  patience = Number(values.patience),
  seed = Number(values.seed);
if (
  ![epochs, batchSize, patience, seed].every(
    (n) => Number.isSafeInteger(n) && n > 0,
  )
)
  throw new Error("epochs/batch-size/patience/seed must be positive integers");
const rawManifest = await readFile(join(dataRoot, "manifest.json"), "utf8");
const manifest = JSON.parse(rawManifest);
await mkdir(out);
await writeFile(join(out, "INCOMPLETE"), "Training in progress\n");
// Intentionally never opens test.bin. Validation chooses checkpoint and threshold.
const train = await loadData(dataRoot, "train"),
  validation = await loadData(dataRoot, "eval");
let model = buildModel(train.length, seed);
console.log(
  `Training ${model.countParams()} parameters on ${train.count} examples; ${validation.count} validation examples`,
);
const order = Uint32Array.from({ length: train.count }, (_, i) => i);
const started = Date.now(),
  history = [];
let bestLoss = Infinity,
  bestEpoch = 0,
  stale = 0;
for (let epoch = 1; epoch <= epochs; epoch++) {
  const begin = Date.now();
  shuffle(order, seed + epoch);
  let lossTotal = 0,
    seen = 0;
  for (let offset = 0; offset < train.count; offset += batchSize) {
    const tensors = batch(train, order, offset, batchSize);
    try {
      const result = await model.trainOnBatch(tensors.inputs, tensors.targets);
      const loss = Array.isArray(result) ? result[0] : result;
      if (!Number.isFinite(loss)) throw new Error("Non-finite training loss");
      lossTotal += loss * tensors.labels.length;
      seen += tensors.labels.length;
    } finally {
      tensors.dispose();
    }
    if (Math.floor(offset / batchSize) % 200 === 0)
      console.log(
        `epoch ${epoch}: ${seen}/${train.count}, loss ${(lossTotal / seen).toFixed(4)}, ${Math.round((Date.now() - begin) / 1000)}s`,
      );
  }
  const prediction = await predictData(model, validation, batchSize);
  const evaluation = metrics(prediction.labels, prediction.scores, 0.5);
  history.push({
    epoch,
    trainingLoss: lossTotal / seen,
    evaluation,
    elapsedMs: Date.now() - begin,
  });
  console.log(JSON.stringify(history.at(-1)));
  if (evaluation.logLoss < bestLoss - 0.0001) {
    bestLoss = evaluation.logLoss;
    bestEpoch = epoch;
    stale = 0;
    await model.save(pathToFileURL(join(out, "best")).href);
  } else stale++;
  await writeFile(join(out, "history.json"), JSON.stringify(history, null, 2));
  if (stale >= patience) break;
}
model.dispose();
model = await tf.loadLayersModel(
  pathToFileURL(join(out, "best/model.json")).href,
);
const prediction = await predictData(model, validation, batchSize);
const chosen = chooseThreshold(prediction.labels, prediction.scores);
const config = {
  schema: 1,
  architecture:
    "shared cl100k embedding + two context CNN towers + nearest-16-token features + dense sigmoid",
  parameters: model.countParams(),
  context: manifest.corpus.context,
  tokensPerSide: train.length,
  tokenizer: manifest.tokenizer,
  threshold: chosen.threshold,
  thresholdSelection:
    "maximum validation F1 over 0.05..0.95; ties retain current threshold",
  checkpointSelection: "minimum validation log loss with early stopping",
  bestEpoch,
  epochsCompleted: history.length,
  seed,
  batchSize,
  corpusManifestHash: manifest.corpusManifestHash,
  encodedManifestHash: hash(rawManifest),
  validation: chosen,
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
  splitCounts: manifest.splits,
  elapsedMs: Date.now() - started,
};
await writeFile(join(out, "config.json"), JSON.stringify(config, null, 2));
const { rm } = await import("node:fs/promises");
await rm(join(out, "INCOMPLETE"));
model.dispose();
console.log(JSON.stringify(config, null, 2));
