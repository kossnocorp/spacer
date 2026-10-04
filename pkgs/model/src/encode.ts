import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { jsonLines, hash, type Example, type Split } from "./data.ts";
import { encodePair, tokenizerInfo } from "./tokenizer.ts";

const { values } = parseArgs({
  options: {
    corpus: { type: "string", default: "tmp/model-corpus" },
    out: { type: "string", default: "tmp/model-encoded" },
    "tokens-per-side": { type: "string", default: "128" },
  },
});
const length = Number(values["tokens-per-side"]);
if (!Number.isSafeInteger(length) || length < 16)
  throw new Error("tokens-per-side must be an integer >=16");
const corpus = resolve(values.corpus),
  out = resolve(values.out);
const rawManifest = await readFile(join(corpus, "manifest.json"), "utf8");
const manifest = JSON.parse(rawManifest);
await mkdir(out);
await writeFile(join(out, "INCOMPLETE"), "Encoding in progress\n");
const splits: Record<string, unknown> = {};
for (const split of ["train", "eval", "test"] as Split[]) {
  const stream = createWriteStream(join(out, `${split}.bin`), { flags: "wx" });
  const completed = finished(stream);
  void completed.catch(() => {});
  let count = 0,
    positive = 0,
    beforeTruncated = 0,
    afterTruncated = 0;
  for await (const row of jsonLines<Example>(join(corpus, `${split}.jsonl`))) {
    const encoded = encodePair(row.before, row.after, length);
    const buffer = Buffer.allocUnsafe((length * 2 + 2) * 4);
    for (let i = 0; i < encoded.values.length; i++)
      buffer.writeUInt32LE(encoded.values[i], i * 4);
    buffer.writeUInt32LE(row.label, length * 2 * 4);
    buffer.writeUInt32LE(row.originalLabel, (length * 2 + 1) * 4);
    if (!stream.write(buffer)) await once(stream, "drain");
    count++;
    positive += row.label;
    beforeTruncated += Number(encoded.beforeTruncated);
    afterTruncated += Number(encoded.afterTruncated);
    if (count % 100_000 === 0) console.log(`${split}: ${count} encoded`);
  }
  stream.end();
  await completed;
  if (count !== manifest.splits[split].examples)
    throw new Error(`Corpus count mismatch in ${split}`);
  splits[split] = { count, positive, beforeTruncated, afterTruncated };
}
await writeFile(
  join(out, "manifest.json"),
  JSON.stringify(
    {
      schema: 1,
      corpus: manifest,
      corpusManifestHash: hash(rawManifest),
      tokenizer: tokenizerInfo,
      tokensPerSide: length,
      recordBytes: (length * 2 + 2) * 4,
      encoding:
        "uint32 little-endian: before tokens, after tokens, target, original-label",
      splits,
    },
    null,
    2,
  ),
);
await rm(join(out, "INCOMPLETE"));
console.log(JSON.stringify(splits, null, 2));
