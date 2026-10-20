import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

test("Jev probe is offline by default and paid runs reuse persisted responses", async () => {
  const root = await mkdtemp(join(tmpdir(), "spacer-jev-test-"));
  try {
    await mkdir(join(root, "pkgs/playground/src"), { recursive: true });
    await copyFile(fileURLToPath(new URL("../../playground/src/formatter.ts", import.meta.url)), join(root, "pkgs/playground/src/formatter.ts"));
    const mock = join(root, "mock.mjs");
    await writeFile(mock, `import { TypeSafeClient } from ${JSON.stringify(import.meta.resolve("@typesafe-ai/sdk"))};
globalThis.fetch = () => { throw new Error("Network forbidden in test"); };
TypeSafeClient.prototype.systemOne = async function(request) {
  if (process.env.FORBID_CALLS) throw new Error("Unexpected paid call");
  return {model: "jev-test-pinned", usage: {input_tokens: 20, output_tokens: 4}, answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, {type: "noul", noul: 0.25}]))};
};`);
    const run = (args: string[], forbid = false) => {
      const result = spawnSync(process.execPath, ["--import", mock, fileURLToPath(new URL("./benchmark-jev.ts", import.meta.url)), ...args], {
        cwd: root, encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "test-only", FORBID_CALLS: forbid ? "1" : "" },
      });
      assert.equal(result.status, 0, result.stderr);
    };
    const resultPath = join(root, "docs/benchmark-data/jev/results.json");
    run([], true);
    assert.equal(JSON.parse(await readFile(resultPath, "utf8")).complete, false);
    run(["--execute"]);
    const saved = await readFile(resultPath, "utf8");
    assert.equal(JSON.parse(saved).complete, true);
    run(["--execute", "--max-estimated-tokens", "0"], true);
    assert.equal(await readFile(resultPath, "utf8"), saved);
    run(["--model", "different-model"], true);
    assert.equal(JSON.parse(await readFile(resultPath, "utf8")).complete, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
