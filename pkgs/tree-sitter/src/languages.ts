import { createRequire } from "node:module";
import { dirname, join, extname } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { Parser, Language } from "web-tree-sitter";
import { workerData } from "node:worker_threads";

const require = createRequire(import.meta.url);
const constructors = new Map<string, typeof Parser>();
export const grammarPackages = [
  "tree-sitter-wasms",
  "@repomix/tree-sitter-wasms",
] as const;
export const grammars = grammarPackages.flatMap((pkg) => {
  const directory = join(
    dirname(require.resolve(`${pkg}/package.json`)),
    "out",
  );
  return readdirSync(directory)
    .filter((file) => file.endsWith(".wasm"))
    .map((file) => ({
      package: pkg,
      language: file.replace(/^tree-sitter-/, "").replace(/\.wasm$/, ""),
      path: join(directory, file),
    }));
});
export const unsupportedGrammars = new Set(["elm", "ql"]); // Bundled ABI 12 binaries cannot run on the supported runtime.
export const languages = [...new Set(grammars.map((g) => g.language))]
  .filter((l) => !unsupportedGrammars.has(l))
  .sort();
const extensions: Record<string, string> = {
  sh: "bash",
  bash: "bash",
  cs: "c_sharp",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  css: "css",
  dart: "dart",
  el: "elisp",
  ex: "elixir",
  exs: "elixir",
  elm: "elm",
  erb: "embedded_template",
  go: "go",
  html: "html",
  htm: "html",
  java: "java",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  kt: "kotlin",
  kts: "kotlin",
  lua: "lua",
  m: "objc",
  ml: "ocaml",
  mli: "ocaml",
  php: "php",
  py: "python",
  pyi: "python",
  ql: "ql",
  qll: "ql",
  res: "rescript",
  resi: "rescript",
  rb: "ruby",
  rs: "rust",
  scala: "scala",
  sc: "scala",
  sol: "solidity",
  swift: "swift",
  rdl: "systemrdl",
  tla: "tlaplus",
  toml: "toml",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  vue: "vue",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
};
export function languageFor(filename: string) {
  const language = extensions[extname(filename).slice(1).toLowerCase()];
  return unsupportedGrammars.has(language) ? undefined : language;
}
const loaded = new Map<string, Promise<Language>>();
export async function loadGrammar(language: string, pkg?: string) {
  if (unsupportedGrammars.has(language))
    throw new Error(
      `${language}: bundled grammar ABI 12 is unsupported (requires rebuilding with tree-sitter >=0.20)`,
    );
  const grammar = pkg
    ? grammars.find((g) => g.language === language && g.package === pkg)
    : grammars.findLast((g) => g.language === language);
  if (!grammar)
    throw new Error(`Unsupported tree-sitter language: ${language}`);
  let promise = loaded.get(grammar.path);
  if (!promise) {
    // Isolated WASM runtimes avoid cross-grammar dynamic-symbol collisions.
    promise = (async () => {
      if (language === "yaml") {
        const Legacy = require("web-tree-sitter-legacy") as typeof Parser & {
          Language: typeof Language;
        };
        await Legacy.init({
          wasmBinary: readFileSync(
            require.resolve("web-tree-sitter-legacy/tree-sitter.wasm"),
          ),
        });
        constructors.set(grammar.path, Legacy);
        return Legacy.Language.load(grammar.path);
      }
      const url = new URL(import.meta.resolve("web-tree-sitter"));
      url.searchParams.set("grammar", grammar.path);
      const runtime: typeof import("web-tree-sitter") = await import(url.href);
      await runtime.Parser.init();
      constructors.set(grammar.path, runtime.Parser);
      return runtime.Language.load(grammar.path);
    })();
    loaded.set(grammar.path, promise);
  }
  return promise;
}
export async function parse(source: string, language: string, pkg?: string) {
  pkg ??= workerData?.package;
  const grammar = await loadGrammar(language, pkg);
  const entry = pkg
    ? grammars.find((g) => g.language === language && g.package === pkg)!
    : grammars.findLast((g) => g.language === language)!;
  const Constructor = constructors.get(entry.path)!;
  const parser = new Constructor();
  try {
    parser.setLanguage(grammar);
    const tree = parser.parse(source);
    if (!tree) throw new Error(`Unable to parse ${language}`);
    return tree;
  } finally {
    parser.delete();
  }
}
// tree-sitter 0.20 exposes these flags as methods, 0.25 as getters.
export function flag(
  node: import("web-tree-sitter").Node,
  key: "hasError" | "isNamed" | "isMissing",
) {
  const value = node[key] as boolean | (() => boolean);
  return typeof value === "function" ? value.call(node) : value;
}
