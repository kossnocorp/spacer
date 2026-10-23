import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closeParsers, prepareDocument, renderDocument } from "@spcr/tree-sitter";
import { lineContext } from "./line-document.ts";
import { windows } from "./data.ts";

after(closeParsers);
test("all-line playground gaps include block edges and separate comments, preserving literal interiors", async () => {
  const source = 'function run() {\n\n// Start\n\n// Assign\nconst a = `hello\n\nworld`;\n/* multi\n\nline */\n\nreturn a;\n\n}\n';
  const doc = await prepareDocument(source, "example.ts", undefined, true);
  const rows = doc.boundaries.map(b => b.row);
  assert.ok(rows.includes(2));
  assert.ok(rows.includes(4));
  assert.ok(rows.includes(5));
  assert.ok(rows.includes(14));
  assert.ok(!rows.includes(7));
  assert.ok(!rows.includes(10));
  const output = await renderDocument(doc, rows.map(() => 0), .5);
  assert.ok(output.startsWith('function run() {\n// Start\n// Assign\n'));
  assert.ok(output.includes('`hello\n\nworld`'));
  assert.ok(output.includes('/* multi\n\nline */'));
  assert.ok(output.endsWith('return a;\n}\n'));
  const stripped = lineContext(doc);
  assert.ok(stripped.lines.every(line => line.trim()));
  doc.preserveBlankLines = true;
  const preserved = lineContext(doc);
  assert.deepEqual(preserved.lines, doc.lines);
  assert.deepEqual(preserved.boundaries, rows);
});
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
