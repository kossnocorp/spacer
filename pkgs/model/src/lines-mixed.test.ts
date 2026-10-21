import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Tensor } from "@tensorflow/tfjs-node";
import { LocalSpacer } from "./predict.ts";
import { tf } from "./runtime.ts";
import { examples } from "../../playground/src/examples/catalog.ts";
import {
  prepareDocument,
  renderDocument,
  closeParsers,
} from "@spcr/tree-sitter";

const directory = fileURLToPath(
  new URL("../../../tmp/spacer-lines-mixed-1/", import.meta.url),
);
test(
  "bilingual Lines preserves export parity and only changes blank lines in TS and Rust",
  {
    skip: !existsSync(`${directory}/best/model.json`),
  },
  async () => {
    const fixture: { tokens: number[][]; scores: number[] } = JSON.parse(
      await readFile(`${directory}/parity.json`, "utf8"),
    );
    const model = await LocalSpacer.load(directory);
    const tensors = tf.memory().numTensors;
    try {
      for (const count of [1, 7, fixture.tokens.length]) {
        const inputs = [0, 128].map((offset) =>
          tf.tensor2d(
            fixture.tokens
              .slice(0, count)
              .map((row) => row.slice(offset, offset + 128)),
            [count, 128],
            "int32",
          ),
        );
        const output = model.model.predict(inputs) as Tensor;
        const scores = await output.data();
        for (let i = 0; i < count; i++)
          assert.ok(Math.abs(scores[i]! - fixture.scores[i]!) < 1e-5);
        tf.dispose([...inputs, output]);
        assert.equal(tf.memory().numTensors, tensors);
      }
      for (const example of examples.filter((e) =>
        ["typescript", "rust"].includes(e.id),
      )) {
        const doc = await prepareDocument(
          example.withoutSpacing,
          example.filename,
        );
        assert.ok(doc.boundaries.length > 0);
        const scores = await model.scoreDocument(doc);
        assert.equal(scores.length, doc.boundaries.length);
        assert.ok(
          scores.every(
            (score) => Number.isFinite(score) && score >= 0 && score <= 1,
          ),
        );
        const output = await renderDocument(doc, scores, model.threshold);
        const nonblank = (source: string) =>
          source.split("\n").filter((line) => line.trim());
        assert.deepEqual(nonblank(output), nonblank(example.withoutSpacing));
        assert.equal(tf.memory().numTensors, tensors);
      }
    } finally {
      model.dispose();
      await closeParsers();
    }
  },
);
