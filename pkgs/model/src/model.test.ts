import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { prepare } from "@spacer/playground";
import { spacingAt, splitFor, hash, windows } from "./data.ts";
import { encodePair, tokenize } from "./tokenizer.ts";
import { metrics, chooseThreshold } from "./metrics.ts";
import { tf } from "./runtime.ts";
import { buildModel } from "./network.ts";

test("labels actual inserted/removed/retained gaps while preserving template text", async () => {
  const before =
    "const a = 1;\n\nconst b = 2;\nconst template = `first\n\nlast`;\n";
  const source = await prepare("source.ts", before);
  const after =
    "const a = 1;\nconst b = 2;\n\nconst template = `first\n\nlast`;\n";
  const oldGaps = spacingAt(source.lines, before),
    newGaps = spacingAt(source.lines, after);
  assert.deepEqual([...oldGaps], [1]);
  assert.deepEqual([...newGaps], [2]);
  assert.throws(
    () => spacingAt(source.lines, after.replace("const b = 2", "const b = 3")),
    /Non-spacing/,
  );
  assert.throws(
    () =>
      spacingAt(source.lines, after.replace("first\n\nlast", "first\nlast")),
    /Non-spacing|missing/,
  );
  assert.deepEqual(windows(["a", "b", "c", "d"], 2, 1), {
    before: "b",
    after: "c",
  });
});

test("file split is deterministic, duplicate-file invariant, approximately 70/15/15", () => {
  const counts = { train: 0, eval: 0, test: 0 };
  for (let i = 0; i < 10_000; i++) counts[splitFor(hash(String(i)), "test")]++;
  assert.ok(counts.train > 6800 && counts.train < 7200);
  assert.ok(counts.eval > 1300 && counts.eval < 1700);
  assert.ok(counts.test > 1300 && counts.test < 1700);
  assert.equal(
    splitFor(hash("same code"), "seed"),
    splitFor(hash("same code"), "seed"),
  );
});

test("LLM BPE keeps nearest boundary tokens, distinguishes sides, reserves zero padding", () => {
  const before = "const longName = 1;\n".repeat(20) + "return result;";
  const after = "const next = 2;\n" + "other();\n".repeat(20);
  const pair = encodePair(before, after, 16);
  assert.equal(pair.beforeTruncated, true);
  assert.equal(pair.afterTruncated, true);
  assert.deepEqual([...pair.values.slice(0, 16)], tokenize(before).slice(-16));
  assert.deepEqual([...pair.values.slice(16)], tokenize(after).slice(0, 16));
  assert.ok(tokenize("<|endoftext|>").every((id) => id > 0));
  assert.equal(encodePair("x", "y", 16).values[0], 0);
});

test("metrics and threshold selection handle imbalanced labels", () => {
  const result = metrics([1, 1, 0, 0], [0.9, 0.4, 0.7, 0.1], 0.5);
  assert.deepEqual([result.tp, result.fn, result.fp, result.tn], [1, 1, 1, 1]);
  assert.equal(result.f1, 0.5);
  assert.equal(chooseThreshold([1, 0, 0], [0.4, 0.2, 0.1]).f1, 1);
  assert.equal(metrics([0, 0], [0, 0], 0.5).f1, 0);
});

test("model trains, serializes and reloads with equivalent probabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "spacer-model-"));
  const model = buildModel(16);
  const a = tf.tensor2d(
    [
      [1, ...Array(15).fill(0)],
      [2, ...Array(15).fill(0)],
    ],
    [2, 16],
    "int32",
  );
  const b = tf.tensor2d(
    [Array(16).fill(3), Array(16).fill(4)],
    [2, 16],
    "int32",
  );
  const targets = tf.tensor2d([[0], [1]]);
  try {
    const loss = await model.trainOnBatch([a, b], targets);
    assert.ok(Number.isFinite(Array.isArray(loss) ? loss[0] : loss));
    const before = model.predict([
      a,
      b,
    ]) as import("@tensorflow/tfjs-node").Tensor;
    await model.save(pathToFileURL(root).href);
    const loaded = await tf.loadLayersModel(
      pathToFileURL(join(root, "model.json")).href,
    );
    const after = loaded.predict([
      a,
      b,
    ]) as import("@tensorflow/tfjs-node").Tensor;
    const x = await before.data(),
      y = await after.data();
    assert.ok(x.every((value, i) => Math.abs(value - y[i]) < 1e-6));
    tf.dispose([before, after]);
    loaded.dispose();
  } finally {
    tf.dispose([a, b, targets]);
    model.dispose();
    await rm(root, { recursive: true });
  }
});
