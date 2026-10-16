import { mkdir, writeFile } from "node:fs/promises";
import { grammars } from "./languages.ts";
import { request, closeParsers } from "./pool.ts";
const result = [];
for (const grammar of grammars) {
  try {
    const types = await request(
      grammar.language,
      "inspect",
      [],
      grammar.package,
    );
    result.push({
      language: grammar.language,
      package: grammar.package,
      types,
    });
    console.log(
      `${grammar.package}/${grammar.language}: ${types.length} node types`,
    );
  } catch (error) {
    result.push({
      language: grammar.language,
      package: grammar.package,
      error: String(error),
    });
  }
}
await mkdir("reports/tree-sitter", { recursive: true });
await writeFile(
  "reports/tree-sitter/grammar-types.json",
  JSON.stringify(result, null, 2) + "\n",
);
await closeParsers();
