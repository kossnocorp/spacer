import { after, test } from "node:test";
import assert from "node:assert/strict";
import { formatJev } from "../server/jev.ts";
import { closeParsers } from "../../tree-sitter/src/index.ts";

after(closeParsers);
test("Jev accepts a server key and reports missing credentials before making a request", async t => {
  const previous = process.env.TYPESAFE_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  });
  delete process.env.TYPESAFE_API_KEY;
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests++;
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer server-test-key");
    const body = JSON.parse(init.body as string);
    return new Response(JSON.stringify({
      model: "jev-test",
      usage: { input_tokens: 1, output_tokens: 0 },
      answers: Object.fromEntries(Object.keys(body.questions).map(key => [key, { type: "noul", noul: 0.1 }])),
    }), { headers: { "content-type": "application/json" } });
  });
  const source = "const a = read();\nuse(a);\n";
  await assert.rejects(formatJev(source, "example.ts"), /Enter a Jev API key/);
  assert.equal(requests, 0);
  process.env.TYPESAFE_API_KEY = "server-test-key";
  const result = await formatJev(source, "example.ts", " ");
  assert.equal(result.output, source);
  assert.equal(requests, 1);
});
test("Jev uses the supplied key, scores multiple languages and changes only blank lines", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests++;
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer playground-test-key");
    const body = JSON.parse(init.body as string);
    assert.equal(body.model, "jev-latest");
    assert.ok(Object.keys(body.questions).length > 0);
    assert.ok(Object.values(body.questions).every((q: any) => q.type === "noul"));
    return new Response(JSON.stringify({
      model: "jev-test-resolved",
      usage: { input_tokens: 12, output_tokens: 0 },
      answers: Object.fromEntries(Object.keys(body.questions).map(key => [key, { type: "noul", noul: 0.9 }])),
    }), { headers: { "content-type": "application/json" } });
  });
  for (const [filename, source] of [
    ["example.ts", "function work(label: string, description: string | undefined, allowNonContiguousMatches: boolean) {\n\tconst result = read(label);\n\tcheck(result);\n\treturn result;\n}\n"],
    ["example.rs", "fn work() {\n\tlet result = read();\n\tcheck(result);\n\tsave(result);\n}\n"],
  ]) {
    const result = await formatJev(source!, filename!, " playground-test-key ");
    assert.equal(result.backend, "jev");
    assert.equal(result.model, "jev-test-resolved");
    assert.ok(result.boundaries > 0);
    assert.ok(result.output.includes("\n\n"));
    assert.deepEqual(result.output.split("\n").filter(l => l.trim()), source!.split("\n").filter(l => l.trim()));
    assert.ok(!JSON.stringify(result).includes("playground-test-key"));
  }
  assert.equal(requests, 2);
});
