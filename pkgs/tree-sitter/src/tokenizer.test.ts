import { test, after } from "node:test";
import assert from "node:assert/strict";
import { grammars, unsupportedGrammars } from "./languages.ts";
import { request, closeParsers } from "./pool.ts";
import {
  token,
  entities,
  normalizeIdentifier,
  identifierTokens,
  IDENTIFIER_BASE,
  prepareDocument,
  renderDocument,
  tokenize,
  encodeContext,
  encodeLegacyContext,
} from "./index.ts";
import { fixtures } from "./fixtures.ts";
after(closeParsers);
test("compact identifiers share identity across a boundary and survive renaming", async () => {
  const a = await tokenize("const customerRecord = loadCustomer();\nsaveCustomer(customerRecord);", "typescript");
  const b = await tokenize("const x = f();\ng(x);", "typescript");
  const values = encodeContext(a, 1, 32);
  assert.deepEqual(values, encodeContext(b, 1, 32));
  const identifiers = [...values].filter(id => id >= IDENTIFIER_BASE);
  assert.equal(identifiers.length, 4);
  assert.equal(identifiers[0], identifiers[3]);
  assert.equal(new Set(identifiers).size, 3);
  assert.ok(!values.includes(token.IDENTIFIER_END));
  assert.notDeepEqual(encodeLegacyContext(a, 1, 32), encodeLegacyContext(b, 1, 32));
});
test("compact windows keep identifier pairs intact and ignore distant names", async () => {
  const a = await tokenize("first; second; alpha; beta; gamma;\ndelta; alpha;", "typescript");
  const b = await tokenize("unrelated;\nfirst; second; alpha; beta; gamma;\ndelta; alpha;", "typescript");
  for (const length of [1, 3, 5, 8]) {
    const values = encodeContext(a, 1, length);
    assert.deepEqual(values, encodeContext(b, 2, length));
    for (let i = 0; i < values.length; i++) {
      if (values[i]! >= IDENTIFIER_BASE) assert.equal(values[i - 1], token.IDENTIFIER);
      if (values[i] === token.IDENTIFIER) {
        assert.ok(values[i + 1]! >= IDENTIFIER_BASE);
        assert.notEqual(i, length - 1);
      }
    }
  }
  assert.throws(() => encodeContext(a, 1, 257), /between 1 and 256/);
});
test("compact identifier vocabulary cannot overflow at maximum context", async () => {
  const source = Array.from({length: 300}, (_, i) => `name${i};`).join("\n");
  const values = encodeContext(await tokenize(source, "typescript"), 150, 256);
  assert.ok([...values].every(id => id < 512));
  assert.equal(new Set([...values].filter(id => id >= IDENTIFIER_BASE)).size, 256);
});
for (const grammar of grammars)
  test(`${grammar.package}: ${grammar.language} ${unsupportedGrammars.has(grammar.language) ? "rejects unsupported ABI" : "uses shared entities"}`, async () => {
    const fixture = fixtures[grammar.language];
    assert.ok(fixture, "Every installed grammar must have a fixture");
    if (unsupportedGrammars.has(grammar.language)) {
      await assert.rejects(
        request(grammar.language, "tokenize", [fixture.code], grammar.package),
        /ABI 12/,
      );
      return;
    }
    const types = await request(
      grammar.language,
      "inspect",
      [],
      grammar.package,
    );
    assert.ok(types.length > 10);
    const events = (await request(
      grammar.language,
      "tokenize",
      [fixture.code],
      grammar.package,
    )) as { id: number }[];
    assert.ok(
      events.some((e) => e.id === token[fixture.entity as keyof typeof token]),
      `${fixture.entity} missing; got ${events.map((e) => entities[e.id] ?? e.id)}`,
    );
    assert.ok(
      events.every(
        (e) =>
          e.id > 0 &&
          (e.id < entities.length || (e.id >= IDENTIFIER_BASE && e.id < 512)),
      ),
    );
  });
test("identifier names share a disjoint, collision-free normalized byte vocabulary", () => {
  for (const name of ["AsdQwe", "asdQwe", "asd-qwe", "asd_qwe", "ASD_QWE"]) {
    assert.equal(normalizeIdentifier(name), "asd_qwe");
    assert.deepEqual(identifierTokens(name), identifierTokens("asd_qwe"));
  }
  assert.equal(normalizeIdentifier("HTTPServer2"), "http_server2");
  for (const name of ["for", "return", "caféValue", "变量", "🔑"])
    assert.ok(identifierTokens(name).every((t) => t >= IDENTIFIER_BASE));
  assert.notDeepEqual(identifierTokens("for"), [token.LOOP]);
});
test("cross-language identifier spellings and control flow align", async () => {
  const samples = {
    typescript: "function AsdQwe() { return 1; }",
    python: "def asd_qwe():\n    return 1\n",
    rust: "fn asd_qwe() -> i32 { return 1; }",
  };
  for (const [language, code] of Object.entries(samples)) {
    const ids = (await tokenize(code, language)).map((e) => e.id);
    for (const kind of [
      "FUNCTION",
      "RETURN",
      "NUMBER",
      "BLOCK_OPEN",
      "BLOCK_CLOSE",
    ] as const)
      assert.ok(ids.includes(token[kind]), `${language} missing ${kind}`);
    assert.ok(ids.join(",").includes(identifierTokens("asd_qwe").join(",")));
  }
});
test("formatting preserves syntax and literal whitespace in TS, Rust and Python", async () => {
  for (const [file, source] of Object.entries({
    "sample.ts":
      "function run() {\n  const text = `a\n\nb`;\n  use(text);\n}\n",
    "sample.rs":
      'fn run() {\n    let text = r#"a\n\nb"#;\n    use_text(text);\n}\n',
    "sample.py": 'def run():\n    text = """a\n\nb"""\n    use(text)\n',
  })) {
    const doc = await prepareDocument(source, file);
    assert.ok(doc.boundaries.length > 0, file);
    const spaced = await renderDocument(
      doc,
      doc.boundaries.map(() => 1),
      0.5,
    );
    assert.ok(spaced.includes("a\n\nb"));
    assert.equal(
      (await prepareDocument(spaced, file)).fingerprint,
      doc.fingerprint,
    );
  }
});
test("invalid syntax is rejected instead of partially rewriting a file", async () => {
  await assert.rejects(prepareDocument("def (:", "broken.py"), /Invalid/);
});
test("Go statement lists expose gaps inside function bodies", async () => {
  const source = "package main\nfunc process() {\n  value := read()\n  check(value)\n  save(value)\n}\n";
  const doc = await prepareDocument(source, "example.go");
  assert.ok(doc.boundaries.some(b => b.row === 3));
  assert.ok(doc.boundaries.some(b => b.row === 4));
  const output = await renderDocument(doc, doc.boundaries.map(() => 1), 0.5);
  assert.ok(output.includes("  value := read()\n\n  check(value)\n\n  save(value)"));
});
test("Ruby each blocks and Python for loops share LOOP without treating identifier spelling as syntax", async () => {
  for (const [language, source] of [
    ["ruby", "items.each do |item|\n  use(item)\nend\n"],
    ["python", "for item in items:\n    use(item)\n"],
  ]) {
    assert.ok(
      (await tokenize(source, language)).some((e) => e.id === token.LOOP),
    );
  }
  assert.ok(
    !(await tokenize("each = 1\n", "ruby")).some((e) => e.id === token.LOOP),
  );
});
