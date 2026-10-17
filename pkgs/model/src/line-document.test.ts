import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closeParsers, prepareDocument, renderDocument } from "@spcr/tree-sitter";
import { lineContext } from "./line-document.ts";
import { windows } from "./data.ts";

after(closeParsers);
test("Lines contexts map original Rust gaps to nonempty text rows", async () => {
  const source = 'fn process() {\n    let value = read();\n\n\n    check(value);\n\n    save(value);\n}\n';
  const document = await prepareDocument(source, "example.rs");
  const context = lineContext(document);
  assert.deepEqual(context.boundaries, [2, 3]);
  assert.deepEqual(windows(context.lines, context.boundaries[0]!, 2), {
    before: 'fn process() {\n    let value = read();',
    after: '    check(value);\n    save(value);',
  });
  const output = await renderDocument(document, [0.1, 0.9], 0.5);
  assert.equal(output, 'fn process() {\n    let value = read();\n    check(value);\n\n    save(value);\n}\n');
});
