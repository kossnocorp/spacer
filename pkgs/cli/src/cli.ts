#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  readFile,
  writeFile,
  rename,
  unlink,
  stat,
  access,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { languages, closeParsers } from "@spcr/tree-sitter";
import { discover } from "./files.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: "spacer-tree-sitter" },
    "model-dir": { type: "string" },
    check: { type: "boolean" },
    help: { type: "boolean" },
    languages: { type: "boolean" },
  },
});
if (values.help) {
  console.log(`Usage: spacer [DIRECTORY|FILE] [--check] [--model spacer-tree-sitter|spacer-lines-ts] [--model-dir PATH]
Formats supported files recursively. Respects .gitignore and .spacerignore; never follows symlinks.
--check: report changes without writing (exit 1 if different).
--languages: list available grammar languages.
Model location: --model-dir, SPACER_MODEL_DIR, ./tmp/<model>, ~/.cache/spcr/<model>, or bundled weights.
Model directory must contain config.json and best/{model.json,weights.bin}.`);
} else if (values.languages) console.log(languages.join("\n"));
else {
  if (positionals.length > 1) throw new Error("Expected one directory or file");
  if (!["spacer-tree-sitter", "spacer-lines-ts"].includes(values.model))
    throw new Error("Unknown model name");
  let directory = values["model-dir"] ?? process.env.SPACER_MODEL_DIR;
  if (!directory) {
    let root = process.cwd();
    for (;;) {
      const candidate = join(root, "tmp", values.model);
      try {
        await access(join(candidate, "config.json"));
        directory = candidate;
        break;
      } catch {}
      const parent = dirname(root);
      if (parent === root) break;
      root = parent;
    }
    if (!directory) {
      const cached = join(homedir(), ".cache", "spcr", values.model);
      try { await access(join(cached, "config.json")); directory = cached; }
      catch { directory = fileURLToPath(new URL(`../models/${values.model}/`, import.meta.url)); }
    }
  }
  let changed = 0,
    failed = 0;
  const files = await discover(positionals[0] ?? ".");
  const { TreeSpacer } = await import("@spcr/model/tree");
  const { LocalSpacer } = await import("@spcr/model");
  const model =
    values.model === "spacer-tree-sitter"
      ? await TreeSpacer.load(resolve(directory))
      : await LocalSpacer.load(resolve(directory));
  try {
    for (const path of files) {
      try {
        const original = await readFile(path, "utf8");
        let output: string;
        if (model instanceof TreeSpacer)
          output = await model.format(original, path);
        else {
          if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
          output = await model.formatSource(original, path);
        }
        if (output === original) continue;
        changed++;
        console.log(`${values.check ? "would change" : "format"} ${path}`);
        if (!values.check) {
          const temporary = `${path}.${randomUUID()}.spcr-tmp`;
          try {
            await writeFile(temporary, output, {
              flag: "wx",
              mode: (await stat(path)).mode,
            });
            if ((await readFile(path, "utf8")) !== original)
              throw new Error("File changed during formatting");
            await rename(temporary, path);
          } finally {
            await unlink(temporary).catch((error) => {
              if (error.code !== "ENOENT") throw error;
            });
          }
        }
      } catch (error) {
        failed++;
        console.error(
          `${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    model.dispose();
    await closeParsers();
  }
  console.log(
    `${files.length} files; ${changed} changed; ${failed} failed; ${values.model}`,
  );
  if (failed) process.exitCode = 2;
  else if (values.check && changed) process.exitCode = 1;
}
