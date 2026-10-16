import { readdir, readFile, lstat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import ignore from "ignore";
import { languageFor } from "@spcr/tree-sitter";

export async function discover(input: string) {
  const root = resolve(input),
    files: string[] = [];
  const stat = await lstat(root);
  if (stat.isSymbolicLink()) return files;
  if (stat.isFile()) {
    if (!languageFor(root)) throw new Error(`Unsupported language: ${root}`);
    return [root];
  }
  async function visit(
    dir: string,
    rules: { base: string; matcher: ReturnType<typeof ignore> }[],
  ) {
    const matcher = ignore();
    for (const name of [".gitignore", ".spacerignore"]) {
      try {
        matcher.add(await readFile(join(dir, name), "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const next = [...rules, { base: dir, matcher }];
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (
        entry.isSymbolicLink() ||
        [
          ".git",
          "node_modules",
          ".venv",
          "__pycache__",
          "target",
          "dist",
          ".void",
        ].includes(entry.name)
      )
        continue;
      const path = join(dir, entry.name),
        suffix = entry.isDirectory() ? "/" : "";
      let ignored = false;
      for (const rule of next) {
        const match = rule.matcher.test(relative(rule.base, path).split("\\").join("/") + suffix);
        if (match.ignored) ignored = true;
        else if (match.unignored) ignored = false;
      }
      if (ignored) continue;
      if (entry.isDirectory()) await visit(path, next);
      else if (entry.isFile() && languageFor(path)) files.push(path);
    }
  }
  await visit(root, []);
  return files;
}
