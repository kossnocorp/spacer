import { test } from "node:test";
import assert from "node:assert/strict";
import { ResultCache, resultKey } from "./result-cache.ts";

test("changing one of three models runs only the new model, and switching back reuses output", async () => {
  const cache = new ResultCache<string>();
  const calls: string[] = [];
  const run = (models: string[], source = "source", filename = "file.ts") =>
    Promise.all(
      models.map((model) =>
        cache.run(resultKey(source, filename, model), async () => {
          calls.push(model);
          return model;
        }),
      ),
    );
  assert.deepEqual(await run(["a", "b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(await run(["a", "d", "c"]), ["a", "d", "c"]);
  assert.deepEqual(calls, ["a", "b", "c", "d"]);
  await run(["a", "b", "c"]);
  assert.equal(calls.length, 4);
  await run(["a"], "changed source");
  await run(["a"], "source", "file.rs");
  assert.equal(calls.length, 6);
});

test("in-flight requests are shared and failed requests can be retried", async () => {
  const cache = new ResultCache<number>();
  let calls = 0;
  let finish!: (value: number) => void;
  const load = () => {
    calls++;
    return new Promise<number>((resolve) => {
      finish = resolve;
    });
  };
  const first = cache.run("same", load);
  const second = cache.run("same", load);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish(42);
  assert.deepEqual(await Promise.all([first, second]), [42, 42]);
  await assert.rejects(
    cache.run("failure", async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.equal(await cache.run("failure", async () => 7), 7);
});

test("cache evicts least-recently-used results after thirty entries", async () => {
  const cache = new ResultCache<number>();
  for (let i = 0; i < 30; i++) await cache.run(String(i), async () => i);
  assert.equal(cache.get("0"), 0);
  await cache.run("30", async () => 30);
  assert.equal(cache.get("1"), undefined);
  assert.equal(cache.get("0"), 0);
  assert.equal(cache.get("30"), 30);
});
