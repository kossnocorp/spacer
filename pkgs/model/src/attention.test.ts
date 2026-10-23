import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { AttentionSpacer } from "./attention-predict.ts";
import { tf } from "./runtime.ts";
import {
  prepareDocument,
  renderDocument,
  closeParsers,
} from "@spcr/tree-sitter";

for (const name of [
  "spacer-tree-sitter-cross-attention-1",
  "spacer-tree-sitter-cross-attention-original-1",
  "spacer-tree-sitter-spacing-context-1",
]) {
  const directory = fileURLToPath(
    new URL(`../../../tmp/${name}/`, import.meta.url),
  );
  test(
    `${name} export matches PyTorch across batch sizes and preserves source syntax`,
    {
      skip: !existsSync(join(directory, "parity.json")),
    },
    async () => {
      const fixture: { tokens: number[][]; scores: number[] } = JSON.parse(
        await readFile(join(directory, "parity.json"), "utf8"),
      );
      const model = await AttentionSpacer.load(directory);
      const tensorCount = tf.memory().numTensors;
      let maxError = 0;
      try {
        for (const count of [1, 7, fixture.tokens.length]) {
          const scores = await model.scoreTokens(
            Int32Array.from(fixture.tokens.slice(0, count).flat()),
            count,
          );
          for (let i = 0; i < count; i++)
            maxError = Math.max(
              maxError,
              Math.abs(scores[i]! - fixture.scores[i]!),
            );
          assert.ok(maxError < 1e-5, `PyTorch/TFJS parity error: ${maxError}`);
          assert.equal(tf.memory().numTensors, tensorCount);
        }
        for (const [filename, source] of [
          [
            "example.ts",
            "function example() {\n  const value = 1;\n\n  console.log(value);\n  return value;\n}\n",
          ],
          [
            "example.rs",
            'fn example() -> i32 {\n    let value = 1;\n\n    println!("{}", value);\n    return value;\n}\n',
          ],
        ]) {
          const document = await prepareDocument(source!, filename!);
          assert.ok(document.boundaries.length > 0);
          const scores = await model.score(document);
          assert.ok(
            [...scores].every(
              (score) => Number.isFinite(score) && score >= 0 && score <= 1,
            ),
          );
          const output = await renderDocument(
            document,
            scores,
            model.threshold,
          );
          assert.deepEqual(
            output.split("\n").filter((line) => line.trim()),
            source!.split("\n").filter((line) => line.trim()),
          );
          assert.equal(tf.memory().numTensors, tensorCount);
        }
        await writeFile(
          join(directory, "export-check.json"),
          JSON.stringify(
            {
              passed: true,
              maxError,
              examples: fixture.tokens.length,
              batchSizes: [1, 7, fixture.tokens.length],
            },
            null,
            2,
          ) + "\n",
        );
      } finally {
        model.dispose();
        await closeParsers();
      }
    },
  );
}
