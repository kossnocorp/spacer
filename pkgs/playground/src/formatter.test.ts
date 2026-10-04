import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { prepare, render, Spacer, options, writeResult } from "./formatter.ts";

test("preserves multiline literal, JSX and comment whitespace even with all-yes decisions", async () => {
  const code =
    "const text = `first\n\nlast`;\n\n/* a\n\nb */\nconst el = <pre>first\n\nlast</pre>;\n";
  const file = await prepare("test.tsx", code);
  for (const boundary of file.boundaries) file.probabilities[boundary] = 1;
  const output = render(file);
  assert.ok(output.includes("`first\n\nlast`"));
  assert.ok(output.includes("/* a\n\nb */"));
  assert.equal(
    output.match(/<pre>[\s\S]*?<\/pre>/)?.[0],
    file.normalized.match(/<pre>[\s\S]*?<\/pre>/)?.[0],
  );
});

test("batches across files concurrently and maps probabilities to exact boundaries", async () => {
  let active = 0,
    peak = 0,
    requests = 0;
  const client = new TypeSafeClient({
    apiKey: "test",
    fetch: async (_url, init) => {
      active++;
      requests++;
      peak = Math.max(peak, active);
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, "jev-latest");
      assert.equal(
        Object.values(body.questions).every((q: any) => q.type === "noul"),
        true,
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return new Response(
        JSON.stringify({
          model: "test",
          usage: { input_tokens: 1, output_tokens: 1 },
          answers: Object.fromEntries(
            Object.keys(body.questions).map((key) => [
              key,
              { type: "noul", noul: 0.65 },
            ]),
          ),
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const files = await Promise.all(
    ["a", "b"].map((name) =>
      prepare(`${name}.ts`, "const a=1;\n\nconst b=2;\nconst c=3;\n"),
    ),
  );
  const spacer = new Spacer({ batchSize: 1, concurrency: 2 }, client);
  await spacer.score(files);
  assert.equal(requests, 4);
  assert.equal(peak, 2);
  assert.equal(
    render(files[0], 65),
    "const a = 1;\n\nconst b = 2;\n\nconst c = 3;\n",
  );
  assert.equal(
    render(files[0], 66),
    "const a = 1;\nconst b = 2;\nconst c = 3;\n",
  );
});

test("credit exhaustion preserves complete files but leaves partial files unrenderable", async () => {
  let requests = 0;
  const client = new TypeSafeClient({
    apiKey: "test",
    retry: { maxRetries: 0 },
    fetch: async () => {
      if (++requests === 3)
        return new Response(JSON.stringify({ error: "Insufficient credits" }), {
          status: 402,
          headers: { "content-type": "application/json" },
        });
      return new Response(
        JSON.stringify({
          model: "test",
          usage: { input_tokens: 1, output_tokens: 1 },
          answers: { b0: { type: "noul", noul: 0.9 } },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const complete = await prepare("complete.ts", "const a=1;\nconst b=2;\n");
  const partial = await prepare(
    "partial.ts",
    "const a=1;\nconst b=2;\nconst c=3;\n",
  );
  await assert.rejects(
    new Spacer({ batchSize: 1, concurrency: 2 }, client).score([
      complete,
      partial,
    ]),
    (error: any) => error.status === 402,
  );
  assert.equal(render(complete), "const a = 1;\n\nconst b = 2;\n");
  assert.equal(Object.keys(partial.probabilities).length, 1);
  assert.throws(() => render(partial), /Missing spacing decision/);
});

test("rejects missing/invalid answers and invalid configuration", async () => {
  for (const threshold of [-1, 101, NaN])
    assert.throws(() => options({ threshold }));
  assert.throws(() => options({ concurrency: 0 }));
  const file = await prepare("test.ts", "const a=1;\nconst b=2;");
  assert.throws(() => render(file), /Missing/);
  const client = new TypeSafeClient({
    apiKey: "test",
    fetch: async () =>
      new Response(
        JSON.stringify({
          model: "test",
          usage: { input_tokens: 0, output_tokens: 0 },
          answers: { b0: { type: "noul", noul: 2 } },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  });
  await assert.rejects(new Spacer({}, client).score([file]), /Invalid Jev/);
});

test("only asks at structural boundaries, keeping decorators and documentation attached", async () => {
  const file = await prepare(
    "test.ts",
    `/* Copyright Example */
/** Docs */
@decorator({
  enabled: true,
})
class Thing {
  field = 1;
  /** Method */
  method(a: string, b: string) {
    const x = a + b;
    return x;
  }
  other() {
    return 2;
  }
}
`,
  );
  const candidates = file.boundaries.map((i) => [
    file.lines[i - 1].trim(),
    file.lines[i].trim(),
  ]);
  assert.ok(candidates.some(([, next]) => next === "/** Docs */"));
  assert.ok(candidates.some(([, next]) => next === "/** Method */"));
  assert.ok(candidates.some(([, next]) => next === "other() {"));
  assert.ok(
    candidates.every(
      ([before, after]) =>
        !before.endsWith("{") &&
        !after.startsWith("}") &&
        after !== "class Thing {" &&
        !after.startsWith("method("),
    ),
  );
});

test("does not overwrite a concurrent edit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacer-test-"));
  try {
    const path = join(dir, "test.ts");
    await writeFile(path, "const a=1;");
    const file = await prepare(path, await readFile(path, "utf8"));
    await writeFile(path, "const a=2;");
    await assert.rejects(
      writeResult(file, render(file)),
      /changed during formatting/,
    );
    assert.equal(await readFile(path, "utf8"), "const a=2;");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("splits oversized batches without losing or moving decisions", async () => {
  const sizes: number[] = [];
  const client = new TypeSafeClient({
    apiKey: "test",
    fetch: async (_url, init) => {
      const { questions } = JSON.parse(init!.body as string);
      const keys = Object.keys(questions);
      sizes.push(keys.length);
      if (keys.length > 1)
        return new Response(
          JSON.stringify({ detail: { error_type: "max_tokens_exceeded" } }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      return new Response(
        JSON.stringify({
          model: "test",
          usage: { input_tokens: 1, output_tokens: 1 },
          answers: Object.fromEntries(
            keys.map((key) => [
              key,
              {
                type: "noul",
                noul: questions[key].instructions.lineImmediatelyAfter.includes(
                  "c =",
                )
                  ? 0.8
                  : 0.2,
              },
            ]),
          ),
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const file = await prepare(
    "test.ts",
    "const a=1;\nconst b=2;\nconst c=3;\nconst d=4;",
  );
  await new Spacer({ batchSize: 128 }, client).score([file]);
  assert.deepEqual(sizes, [3, 2, 1, 1, 1]);
  assert.equal(
    render(file),
    "const a = 1;\nconst b = 2;\n\nconst c = 3;\nconst d = 4;\n",
  );
});

test("reports the source file when one question alone exceeds the limit", async () => {
  const client = new TypeSafeClient({
    apiKey: "test",
    fetch: async () =>
      new Response(
        JSON.stringify({ detail: { error_type: "max_tokens_exceeded" } }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
  });
  const file = await prepare("large.ts", "const a=1;\nconst b=2;");
  await assert.rejects(
    new Spacer({}, client).score([file]),
    (error) =>
      (error as Error & { sourceFile: string }).sourceFile === "large.ts",
  );
});
