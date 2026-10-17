import { test, after } from "node:test";
import assert from "node:assert/strict";
import { examples } from "./examples/catalog.ts";
import { tokenize, closeParsers, languageFor, prepareDocument, renderDocument } from "../../tree-sitter/src/index.ts";
after(closeParsers);
test("all requested examples have pinned attribution and only blank-line differences", () => {
  assert.equal(examples.length, 17);
  assert.equal(new Set(examples.map(e => e.id)).size, 17);
  for (const e of examples) {
    assert.match(e.commit, /^[a-f0-9]{40}$/);
    assert.ok(languageFor(e.filename), e.id);
    assert.ok(e.url.includes(e.commit));
    assert.ok(e.original.split("\n").length >= 48);
    assert.deepEqual(e.original.split("\n").filter(l => l.trim()), e.withoutSpacing.split("\n").filter(l => l.trim()), e.id);
    assert.ok(e.removedBlankLines > 0, e.id);
  }
});
for (const example of examples) {
  test(`${example.label} example retains the same syntax tokens without blank lines`, async () => {
    const language = languageFor(example.filename)!;
    const original = await tokenize(example.original, language);
    const stripped = await tokenize(example.withoutSpacing, language);
    assert.deepEqual(stripped.map(e => e.id), original.map(e => e.id));
    const document = await prepareDocument(example.withoutSpacing, example.filename);
    assert.ok(document.boundaries.length > 0, `${example.id} needs adjustable gaps`);
    // Both extreme decisions must preserve syntax, including literal/comment text.
    await renderDocument(document, document.boundaries.map(() => 0), 0.5);
    await renderDocument(document, document.boundaries.map(() => 1), 0.5);
  });
}
