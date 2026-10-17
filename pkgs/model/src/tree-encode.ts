import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { prepare } from "@spcr/playground";
import {
  tokenize,
  encodeContext,
  tokenizerInfo,
  languageFor,
  closeParsers,
  type Event,
} from "@spcr/tree-sitter";
import { jsonLines, hash, type Example } from "./data.ts";
import { encodePair, tokenizerInfo as linesTokenizer } from "./tokenizer.ts";

const { values } = parseArgs({
  options: {
    corpus: { type: "string", default: "tmp/model-corpus-ordered" },
    out: { type: "string", default: "tmp/model-encoded-tree-sitter-compact" },
    "repos-root": { type: "string", default: "tmp" },
    "tokens-per-side": { type: "string", default: "128" },
  },
});
const out = resolve(values.out),
  length = Number(values["tokens-per-side"]);
if (!Number.isSafeInteger(length) || length < 16 || length > 256)
  throw new Error("tokens-per-side must be between 16 and 256");
await mkdir(out);
await writeFile(join(out, "INCOMPLETE"), "Encoding tree-sitter corpus\n");
const raw = await readFile(join(values.corpus, "manifest.json"), "utf8"),
  corpus = JSON.parse(raw);
const provenance = new Map<string, { afterHash: string }>();
for await (const row of jsonLines<{ file: string; afterHash: string }>(
  join(values.corpus, "files.jsonl"),
))
  provenance.set(row.file, row);
const seen = new Map<string, number>(),
  splits: Record<string, unknown> = {};
const exclusions: { file: string; error: string }[] = [];
await mkdir(join(out, "lines-reference"));
const reference = createWriteStream(join(out, "lines-reference/test.bin"));
const referenceDone = finished(reference);
void referenceDone.catch(() => {});
const binary = (tokens: ArrayLike<number>, row: Example) => {
  const b = Buffer.alloc((length * 2 + 2) * 4);
  for (let i = 0; i < tokens.length; i++) b.writeUInt32LE(tokens[i], i * 4);
  b.writeUInt32LE(row.label, length * 2 * 4);
  b.writeUInt32LE(row.originalLabel, (length * 2 + 1) * 4);
  return b;
};
try {
  for (const split of ["train", "eval", "test"]) {
    const stream = createWriteStream(join(out, `${split}.bin`));
    const done = finished(stream);
    void done.catch(() => {});
    let current = "",
      events: Event[] | undefined,
      count = 0,
      positive = 0,
      duplicates = 0,
      conflicts = 0,
      invalid = 0;
    for await (const row of jsonLines<Example>(
      join(values.corpus, `${split}.jsonl`),
    )) {
      if (row.file !== current) {
        current = row.file;
        events = undefined;
        try {
          const [owner, repo, ...path] = row.file.split("/");
          const filename = join(
            values["repos-root"],
            `${owner}--${repo}`,
            ...path,
          );
          const source = await readFile(filename, "utf8");
          if (hash(source) !== provenance.get(row.file)?.afterHash)
            throw new Error("Source changed since corpus generation");
          const prepared = await prepare(filename, source);
          events = await tokenize(
            prepared.lines.join("\n"),
            languageFor(filename)!,
          );
        } catch (error) {
          exclusions.push({ file: row.file, error: String(error) });
        }
      }
      if (!events) {
        invalid++;
        continue;
      }
      const tokens = encodeContext(events, row.boundary, length);
      const key = createHash("sha256")
        .update(Buffer.from(tokens.buffer))
        .digest("hex");
      if (seen.has(key)) {
        duplicates++;
        conflicts += Number(seen.get(key) !== row.label);
        continue;
      }
      seen.set(key, row.label);
      if (!stream.write(binary(tokens, row))) await once(stream, "drain");
      if (
        split === "test" &&
        !reference.write(
          binary(encodePair(row.before, row.after, length).values, row),
        )
      )
        await once(reference, "drain");
      count++;
      positive += row.label;
      if (count % 100000 === 0) console.log(`${split}: ${count} tree examples`);
    }
    stream.end();
    await done;
    if (!count) throw new Error(`No usable examples in ${split}`);
    splits[split] = { count, positive, duplicates, conflicts, invalid };
    console.log(split, splits[split]);
  }
  reference.end();
  await referenceDone;
  const manifest = {
    schema: 1,
    modelName: "spacer-tree-sitter",
    corpus,
    corpusManifestHash: hash(raw),
    tokenizer: tokenizerInfo,
    tokensPerSide: length,
    recordBytes: (length * 2 + 2) * 4,
    splits,
    deduplication:
      "Exact encoded contexts deduplicated across all splits, train first; first target retained. Original file-group split assignments preserved.",
    trainingLanguages: ["typescript", "tsx"],
    exclusions: exclusions.length,
  };
  await writeFile(
    join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  await writeFile(
    join(out, "excluded.json"),
    JSON.stringify(exclusions, null, 2),
  );
  await writeFile(
    join(out, "lines-reference/manifest.json"),
    JSON.stringify({ ...manifest, tokenizer: linesTokenizer }, null, 2),
  );
  await rm(join(out, "INCOMPLETE"));
} finally {
  await closeParsers();
}
