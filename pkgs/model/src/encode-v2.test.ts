import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { hash } from "./data.ts";

test("raw TS/Rust encoding does not expose target blank lines or modify upstream sources", async () => {
  const root = await mkdtemp("/tmp/opencode/spacer-encoding-test-");
  try {
    const outputs: string[] = [];
    for (const spacing of [false, true]) {
      const corpus = join(root, String(spacing));
      await mkdir(corpus);
      const files = [];
      for (let i = 0; i < 60; i++) {
        const rust = i % 2 === 0;
        const path = `example-${i}.${rust ? "rs" : "ts"}`;
        const source = rust
          ? `fn example_${i}() -> i32 {\n    let value_${i} = ${i};\n${spacing ? "\n" : ""}    return value_${i};\n}\n`
          : `export function example_${i}() {\n    const value_${i} = ${i};\n${spacing ? "\n" : ""}    return value_${i};\n}\n`;
        await writeFile(join(corpus, path), source);
        files.push({
          path,
          sha256: hash(source),
          language: rust ? "rust" : "typescript",
        });
      }
      const binary = Buffer.from([0x47, 0x00, 0xff, 0x80]);
      await writeFile(join(corpus, "video.ts"), binary);
      files.push({
        path: "video.ts",
        sha256: createHash("sha256").update(binary).digest("hex"),
        language: "typescript",
      });
      await writeFile(
        join(corpus, "manifest.json"),
        JSON.stringify({ id: "fixture" }),
      );
      await writeFile(
        join(corpus, "files.jsonl"),
        files.map((file) => JSON.stringify(file)).join("\n") + "\n",
      );
      const out = join(root, `encoded-${spacing}`);
      outputs.push(out);
      await promisify(execFile)(process.execPath, [
        fileURLToPath(new URL("./encode-v2.ts", import.meta.url)),
        "--raw",
        "--corpus",
        corpus,
        "--out",
        out,
      ]);
      for (const file of files)
        assert.equal(
          createHash("sha256")
            .update(await readFile(join(corpus, file.path)))
            .digest("hex"),
          file.sha256,
        );
      const manifest = JSON.parse(
        await readFile(join(out, "manifest.json"), "utf8"),
      );
      assert.equal(manifest.omitted, 1);
      assert.match(
        await readFile(join(out, "excluded.jsonl"), "utf8"),
        /video\.ts/,
      );
    }
    for (const split of ["train", "eval", "test"]) {
      const [absent, present] = await Promise.all(
        outputs.map((out) => readFile(join(out, `${split}.bin`))),
      );
      assert.ok(absent!.length > 0);
      assert.equal(absent!.length, present!.length);
      for (let offset = 0; offset < absent!.length; offset += 387 * 4) {
        assert.deepEqual(
          absent!.subarray(offset, offset + 384 * 4),
          present!.subarray(offset, offset + 384 * 4),
        );
        assert.equal(absent!.readUInt32LE(offset + 384 * 4), 0);
        assert.equal(present!.readUInt32LE(offset + 384 * 4), 1);
        assert.equal(
          absent!.readUInt32LE(offset + 386 * 4),
          present!.readUInt32LE(offset + 386 * 4),
        );
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
