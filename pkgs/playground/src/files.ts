import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import ignore from "ignore";

export async function discover(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (
    dir: string,
    parents: { dir: string; matcher: ReturnType<typeof ignore> }[],
  ) => {
    const matcher = ignore();
    for (const name of [".gitignore", ".spacerignore"]) {
      try {
        matcher.add(await readFile(join(dir, name), "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const rules = [...parents, { dir, matcher }];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (
        entry.isSymbolicLink() ||
        /^(?:\.git|node_modules|dist|build|coverage|vendor|\.next|\.turbo)$/.test(
          entry.name,
        )
      )
        continue;
      const path = join(dir, entry.name);
      if (
        rules.some((rule) =>
          rule.matcher.ignores(
            relative(rule.dir, path) + (entry.isDirectory() ? "/" : ""),
          ),
        )
      )
        continue;
      if (entry.isDirectory()) await walk(path, rules);
      else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) files.push(path);
    }
  };
  await walk(root, []);
  return files.sort();
}
