import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closeParsers, tokenize, encodeContext, encodeLegacyContext } from "@spcr/tree-sitter";
import { inspectTokenizers } from "./inspect-tokenizers.ts";
import { encodePair, inspectText, tokenize as textTokens } from "./tokenizer.ts";
after(closeParsers);
test("unsupported grammars are rejected", async () => {
  await assert.rejects(inspectTokenizers("SELECT id FROM users;", "example.sql", 0, 32), /Unsupported filename extension/);
});

test("inspector renders exact model IDs and links repeated Unicode identifiers", async () => {
  const source = "const café = load();\n\nuse(café);";
  const result = await inspectTokenizers(source, "sample.ts", 2, 32);
  const events = await tokenize(source, "typescript");
  assert.deepEqual(result.views[0]!.tokens.map(t => t.id), [...encodeContext(events, 2, 32)]);
  assert.deepEqual(result.views[1]!.tokens.map(t => t.id), [...encodeLegacyContext(events, 2, 32)]);
  assert.deepEqual(result.views[2]!.tokens.map(t => t.id), [...encodePair("const café = load();", "use(café);", 32).values]);
  const identity = result.identities.find(i => i.name === "café")!;
  assert.equal(identity.occurrences.length, 2);
  for (const range of identity.occurrences) assert.equal(source.slice(range.start, range.end), "café");
  assert.deepEqual(identity.occurrences.map(o => o.side), ["before", "after"]);
});
test("BPE inspection preserves IDs and valid source ranges for multibyte text", () => {
  const source = 'const 名字 = "🦊";\nuse(名字);';
  const tokens = inspectText(source);
  assert.deepEqual(tokens.map(t => t.id), textTokens(source));
  assert.ok(tokens.every(t => t.start >= 0 && t.end >= t.start && t.end <= source.length));
});
