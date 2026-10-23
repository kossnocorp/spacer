import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareDocument,
  closeParsers,
  encodeContext,
} from "@spcr/tree-sitter";
import { spacingContext, scoreSequential } from "./spacing-context.ts";
import { encodePair } from "./tokenizer.ts";

after(closeParsers);
test("target gap is invisible in both streams, surrounding spacing remains visible", async () => {
  const contexts = [];
  for (const blank of ["", "\n", "\n\n\t\n"]) {
    const source = `function run() {\nconst a = 1;\n\nconst b = 2;\n${blank}const c = 3;\n\nreturn a + b + c;\n}\n`;
    const doc = await prepareDocument(source, "example.ts", undefined, true);
    const gap = doc.boundaries.find(
      (b) => doc.lines[b.row] === "const c = 3;",
    )!;
    const context = spacingContext(doc.lines, gap.from, gap.to);
    assert.ok(context.before.includes("const a = 1;\n\nconst b = 2;"));
    assert.ok(context.after.includes("const c = 3;\n\nreturn"));
    contexts.push([
      ...encodePair(context.before, context.after, 128).values,
      ...encodeContext(doc.events, gap.row, 64),
    ]);
  }
  assert.deepEqual(contexts[0], contexts[1]);
  assert.deepEqual(contexts[0], contexts[2]);
});

test("top-to-bottom inference incorporates earlier insertions and removals", async () => {
  const doc = await prepareDocument(
    "const a = 1;\nconst b = 2;\n\nconst c = 3;\nconst d = 4;\n",
    "example.ts",
    undefined,
    true,
  );
  const seen: number[][] = [];
  await scoreSequential(doc, 0.5, async (tokens) => {
    seen.push([...tokens.slice(0, 256)]);
    return seen.length === 1 ? 0.9 : 0.1;
  });
  const expected = encodePair(
    "const a = 1;\n\nconst b = 2;\nconst c = 3;",
    "const d = 4;",
    128,
  );
  assert.deepEqual(seen[2], [...expected.values]);
  assert.deepEqual(doc.lines, [
    "const a = 1;",
    "const b = 2;",
    "",
    "const c = 3;",
    "const d = 4;",
  ]);
});
