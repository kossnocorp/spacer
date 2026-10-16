import { readdir, readFile, mkdir, writeFile, copyFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(join(process.cwd(), "package.json"));
const ts = require("typescript");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (pkg.name === "spcr") {
  for (const name of ["spacer-lines-ts", "spacer-tree-sitter"]) {
    const root = join("../../tmp", name);
    try { await access(join(root, "INCOMPLETE")); throw new Error(`${name} is incomplete`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const file of ["config.json", "best/model.json", "best/weights.bin"]) {
      await mkdir(join("models", name, "best"), { recursive: true });
      await copyFile(join(root, file), join("models", name, file));
    }
  }
}
await mkdir("lib", { recursive: true });
for (const entry of await readdir("src")) {
  if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
  const source = await readFile(join("src", entry), "utf8");
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true } });
  // Worker entry paths are URL literals rather than import specifiers.
  await writeFile(join("lib", entry.replace(/\.ts$/, ".js")), result.outputText.replace('"./worker.ts"', '"./worker.js"'));
}
