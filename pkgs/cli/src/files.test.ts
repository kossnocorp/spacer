import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discover } from "./files.ts";
test("discovery honors nested ignores, supported languages and symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "spcr-files-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, ".gitignore"), "ignored.py\n*.rs\n");
    await writeFile(join(root, "src/.spacerignore"), "!good.rs\nskip.rs\n");
    for (const f of [
      "a.ts",
      "b.py",
      "ignored.py",
      "src/good.rs",
      "src/skip.rs",
      "readme.md",
    ])
      await writeFile(join(root, f), "");
    await symlink(join(root, "a.ts"), join(root, "link.ts"));
    assert.deepEqual(
      (await discover(root)).map((f) => f.slice(root.length + 1)),
      ["a.ts", "b.py", "src/good.rs"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
