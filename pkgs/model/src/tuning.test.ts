import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tf } from "./runtime.ts";
import { buildModel, type Architecture } from "./network.ts";

test("multi-seed contextual ensemble exports as one reloadable TFJS model", async () => {
  const root = await mkdtemp(join(tmpdir(), "spcr-ensemble-"));
  const architecture: Architecture = {
    embedding: 8,
    channels: 12,
    hidden: 16,
    dilations: [1, 2, 4],
    nearest: 16,
    contextualNearest: 8,
    dropout: 0.2,
  };
  const rows = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 64 }, (_, i) => (i * 7 + row * 11) % 512),
  );
  const inputs = [
    tf.tensor2d(
      rows.map((r) => r.slice(0, 32)),
      [4, 32],
      "int32",
    ),
    tf.tensor2d(
      rows.map((r) => r.slice(32)),
      [4, 32],
      "int32",
    ),
  ];
  const scores: number[][] = [];
  try {
    for (const seed of [42, 123, 2026]) {
      const model = buildModel(32, seed, 512, architecture);
      const prediction = model.predict(
        inputs,
      ) as import("@tensorflow/tfjs-node").Tensor;
      scores.push(Array.from(await prediction.data()));
      await mkdir(join(root, String(seed)), { recursive: true });
      await model.save(pathToFileURL(join(root, String(seed), "best")).href);
      prediction.dispose();
      model.dispose();
    }
    const expected = rows.map(
      (_, i) => scores.reduce((sum, row) => sum + row[i], 0) / scores.length,
    );
    const out = join(root, "ensemble");
    await mkdir(out);
    await writeFile(
      join(out, "config.json"),
      JSON.stringify({
        tokensPerSide: 32,
        members: ["../42", "../123", "../2026"],
      }),
    );
    await writeFile(
      join(out, "parity.json"),
      JSON.stringify({ tokens: rows, scores: expected }),
    );
    const command = fileURLToPath(new URL("./rocm.ts", import.meta.url));
    const result = spawnSync(
      process.execPath,
      [command, "export", "--out", out],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const parity = JSON.parse(
      await readFile(join(out, "export-check.json"), "utf8"),
    );
    assert.equal(parity.passed, true);
    // Load only the merged file; its member checkpoints are not needed at inference.
    for (const seed of [42, 123, 2026])
      await rm(join(root, String(seed)), { recursive: true });
    const model = await tf.loadLayersModel(
      pathToFileURL(resolve(out, "best/model.json")).href,
    );
    const prediction = model.predict(
      inputs,
    ) as import("@tensorflow/tfjs-node").Tensor;
    const actual = await prediction.data();
    expected.forEach((v, i) => assert.ok(Math.abs(actual[i] - v) < 1e-5));
    prediction.dispose();
    model.dispose();
  } finally {
    tf.dispose(inputs);
    await rm(root, { recursive: true, force: true });
  }
});
