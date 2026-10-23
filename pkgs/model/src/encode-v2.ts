// Matched lexical + structural inputs. No model-specific membership or test evaluation.
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { prepare } from "@spcr/playground";
import {
  prepareDocument,
  tokenize,
  encodeContext,
  languageFor,
  closeParsers,
  type Event,
} from "@spcr/tree-sitter";
import { encodePair, tokenizerInfo } from "./tokenizer.ts";
import { jsonLines, hash, splitFor, windows, type Example } from "./data.ts";
import { spacingContext } from "./spacing-context.ts";

const { values } = parseArgs({
  options: {
    corpus: { type: "string", default: "corpora/jev-typescript-ordered-v1" },
    out: { type: "string", default: "tmp/encoded-v2-teacher" },
    raw: { type: "boolean", default: false },
    "spacing-context": { type: "boolean", default: false },
  },
});
const roots = values.corpus.split(",");
if (values["spacing-context"] && !values.raw)
  throw new Error("Spacing context requires original-source mode");
if (!values.raw && roots.length !== 1)
  throw new Error("Teacher mode expects one corpus");
for (const root of roots) {
  try {
    await readFile(join(root, "INCOMPLETE"));
    throw new Error(`Incomplete corpus: ${root}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
await mkdir(values.out);
await writeFile(
  join(values.out, "INCOMPLETE"),
  "Encoding matched lexical/syntax contexts\n",
);
// 256 lexical uint32s + 128 compact syntax uint32s + label + original + language.
const width = 387;
const streams = Object.fromEntries(
  ["train", "eval", "test"].map((split) => [
    split,
    createWriteStream(join(values.out, `${split}.bin`)),
  ]),
);
const done = Object.values(streams).map((stream) => finished(stream));
for (const promise of done) void promise.catch(() => {});
const counts = Object.fromEntries(
  ["train", "eval", "test"].map((split) => [split, { count: 0, positive: 0 }]),
);
const exclusions = createWriteStream(join(values.out, "excluded.jsonl"));
const membership = createWriteStream(join(values.out, "files.jsonl"));
// V8 limits each Set to 2^24 entries. Partition by SHA-256 prefix while
// retaining the complete hash, so admission/deduplication stays identical.
const seen = Array.from({ length: 256 }, () => new Set<string>());
const seenFiles = new Set<string>();
let omitted = 0,
  duplicates = 0,
  visited = 0;
async function emit(
  split: string,
  before: string,
  after: string,
  events: Event[],
  boundary: number,
  label: number,
  original: number,
  language: number,
) {
  const lexical = encodePair(before, after, 128).values;
  const syntax = encodeContext(events, boundary, 64);
  const buffer = Buffer.alloc(width * 4);
  lexical.forEach((token, index) => buffer.writeUInt32LE(token, index * 4));
  syntax.forEach((token, index) =>
    buffer.writeUInt32LE(token, (256 + index) * 4),
  );
  // Deduplicate using lexical input, excluding labels and language. Every model
  // sees the same rows, including cross-language duplicates in mixed training.
  const key = hash(buffer.subarray(0, 256 * 4).toString("base64"));
  const shard = seen[Number.parseInt(key.slice(0, 2), 16)]!;
  if (shard.has(key)) {
    duplicates++;
    return;
  }
  shard.add(key);
  buffer.writeUInt32LE(label, 384 * 4);
  buffer.writeUInt32LE(original, 385 * 4);
  buffer.writeUInt32LE(language, 386 * 4);
  if (!streams[split]!.write(buffer)) await once(streams[split]!, "drain");
  counts[split]!.count++;
  counts[split]!.positive += label;
  if (counts[split]!.count % 100000 === 0)
    console.log(split, counts[split], { duplicates, omitted });
}
try {
  for (const split of ["train", "eval", "test"]) {
    for (const root of roots) {
      const manifest = JSON.parse(
        await readFile(join(root, "manifest.json"), "utf8"),
      );
      if (values.raw) {
        for await (const row of jsonLines<{
          path: string;
          sha256: string;
          language: string;
        }>(join(root, "files.jsonl"))) {
          const filename = join(root, row.path);
          const bytes = await readFile(filename);
          if (createHash("sha256").update(bytes).digest("hex") !== row.sha256)
            throw new Error(`Changed source: ${filename}`);
          let source: string;
          try {
            source = new TextDecoder("utf-8", {
              fatal: true,
              ignoreBOM: true,
            }).decode(bytes);
            if (source.includes("\0")) throw new Error("NUL-containing source");
          } catch (error) {
            // Content admission is distinct from byte-integrity verification.
            if (split === "train") {
              omitted++;
              exclusions.write(
                JSON.stringify({ filename, error: String(error) }) + "\n",
              );
            }
            continue;
          }
          // Split without looking at labels, canonicalizing empty rows only.
          const lines = source
            .replaceAll("\r\n", "\n")
            .split("\n")
            .filter((line) => line.trim());
          const group = hash(lines.join("\n"));
          if (
            splitFor(group, "spacer-original-v1", 15, 15) !== split ||
            seenFiles.has(group)
          )
            continue;
          seenFiles.add(group);
          let document, events: Event[];
          try {
            document = await prepareDocument(
              source,
              filename,
              undefined,
              values["spacing-context"],
            );
            events = values["spacing-context"]
              ? document.events
              : await tokenize(lines.join("\n"), languageFor(filename)!);
          } catch (error) {
            omitted++;
            exclusions.write(
              JSON.stringify({ filename, error: String(error) }) + "\n",
            );
            continue;
          }
          const rows: number[] = [];
          let number = 0;
          for (const line of document.lines) {
            rows.push(number);
            if (line.trim()) number++;
          }
          membership.write(
            JSON.stringify({
              filename,
              sha256: row.sha256,
              group,
              split,
              boundaries: document.boundaries.length,
            }) + "\n",
          );
          for (const gap of document.boundaries) {
            const boundary = rows[gap.row]!;
            const context = values["spacing-context"]
              ? spacingContext(document.lines, gap.from, gap.to)
              : windows(lines, boundary, 5);
            await emit(
              split,
              context.before,
              context.after,
              events,
              values["spacing-context"] ? gap.row : boundary,
              Number(gap.existing),
              Number(gap.existing),
              row.language === "rust" ? 1 : 0,
            );
          }
          if (++visited % 1000 === 0)
            console.log({ visited, split, counts: counts[split] });
        }
      } else {
        const provenance = new Map<string, string>();
        for await (const row of jsonLines<{ file: string; afterHash: string }>(
          join(root, "dataset/files.jsonl"),
        ))
          provenance.set(row.file, row.afterHash);
        let current = "",
          events: Event[] | undefined;
        for await (const row of jsonLines<Example>(
          join(root, "dataset", `${split}.jsonl`),
        )) {
          if (current !== row.file) {
            current = row.file;
            events = undefined;
            const [owner, repo, ...parts] = current.split("/");
            const filename = join(root, "repos", `${owner}--${repo}`, ...parts);
            const source = await readFile(filename, "utf8");
            if (hash(source) !== provenance.get(current))
              throw new Error(`Source hash changed: ${current}`);
            try {
              const prepared = await prepare(filename, source);
              events = await tokenize(
                prepared.lines.join("\n"),
                languageFor(filename)!,
              );
            } catch (error) {
              exclusions.write(
                JSON.stringify({ file: current, error: String(error) }) + "\n",
              );
            }
          }
          if (!events) {
            omitted++;
            continue;
          }
          await emit(
            split,
            row.before,
            row.after,
            events,
            row.boundary,
            row.label,
            row.originalLabel,
            0,
          );
        }
      }
      console.log(root, manifest.id, split, counts[split]);
    }
  }
  for (const stream of Object.values(streams)) stream.end();
  exclusions.end();
  membership.end();
  await Promise.all([...done, finished(exclusions), finished(membership)]);
  const manifests = await Promise.all(
    roots.map(async (root) => ({
      root,
      sha256: hash(await readFile(join(root, "manifest.json"), "utf8")),
    })),
  );
  await writeFile(
    join(values.out, "manifest.json"),
    JSON.stringify(
      {
        schema: 2,
        recordU32: width,
        lexicalTokens: 256,
        syntaxTokens: 128,
        splits: counts,
        lexicalTokenizer: tokenizerInfo,
        structuralTokenizer:
          "Tree-sitter compact identifier schema 2, 64 tokens per side",
        architectureInput: values["spacing-context"]
          ? "spacing-context-v1: all safe inter-line gaps; target gap omitted; five nonempty lines/side with internal spacing; raw syntax events"
          : "lexical BPE + independent structural context; blank lines removed before tokenization",
        contextMode: values["spacing-context"]
          ? "spacing-context-v1"
          : "stripped",
        deduplication:
          "exact truncated lexical context, train first; identical membership for all architectures",
        corpus: manifests,
        labelSource: values.raw
          ? "original upstream spacing (no Jev or formatter)"
          : "Jev-completed teacher",
        omitted,
        duplicates,
      },
      null,
      2,
    ),
  );
  await rm(join(values.out, "INCOMPLETE"));
} finally {
  await closeParsers();
}
