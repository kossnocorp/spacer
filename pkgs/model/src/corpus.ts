import { readFile, readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify, parseArgs } from "node:util";
import { prepare, defaults } from "@spacer/playground";
import {
  hash,
  splitFor,
  spacingAt,
  windows,
  jsonLines,
  jsonWriter,
  type Split,
  type Example,
} from "./data.ts";

const { values } = parseArgs({
  options: {
    "run-dir": { type: "string", default: "tmp/full-run" },
    "repos-root": { type: "string", default: "tmp" },
    out: { type: "string", default: "tmp/model-corpus" },
    context: { type: "string", default: String(defaults.context) },
    "eval-percent": { type: "string", default: "15" },
    "test-percent": { type: "string", default: "15" },
    seed: { type: "string", default: "spacer-v1" },
  },
});
const context = Number(values.context),
  evalPercent = Number(values["eval-percent"]),
  testPercent = Number(values["test-percent"]);
if (!Number.isSafeInteger(context) || context < 1)
  throw new Error("context must be a positive integer");
if (
  ![evalPercent, testPercent].every((n) => Number.isFinite(n) && n > 0) ||
  evalPercent + testPercent >= 100
)
  throw new Error(
    "eval/test percentages must be positive and sum to less than 100",
  );
const output = resolve(values.out),
  run = resolve(values["run-dir"]),
  root = resolve(values["repos-root"]);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Never silently overwrite a dataset or its split assignment.
await writeFile(join(output, "INCOMPLETE"), "Corpus generation in progress\n");
const writers = {
  train: jsonWriter(join(output, "train.jsonl")),
  eval: jsonWriter(join(output, "eval.jsonl")),
  test: jsonWriter(join(output, "test.jsonl")),
};
const filesWriter = jsonWriter(join(output, "files.jsonl"));
const failures = jsonWriter(join(output, "excluded.jsonl"));
const emptyStats = () => ({
  files: 0,
  groups: 0,
  examples: 0,
  positive: 0,
  transitions: { "00": 0, "01": 0, "10": 0, "11": 0 } as Record<string, number>,
});
const stats = { train: emptyStats(), eval: emptyStats(), test: emptyStats() };
const groups = new Set<string>();
const seen = new Map<string, { split: Split; label: number }>();
let processed = 0,
  excluded = 0,
  duplicates = 0,
  crossSplitDuplicates = 0,
  conflictingDuplicates = 0;
const sources = [];
const exec = promisify(execFile);
for (const manifest of (await readdir(run))
  .filter((name) => name.endsWith(".baseline.json"))
  .sort()) {
  const baseline = JSON.parse(await readFile(join(run, manifest), "utf8"));
  const slug = baseline.repo.replace("/", "--"),
    repoRoot = join(root, slug);
  const eligible = new Set<string>();
  try {
    for await (const record of jsonLines<{ path: string; error?: string }>(
      join(run, `${slug}.progress.jsonl`),
    ))
      if (!record.error) eligible.add(record.path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  if (!eligible.size) continue;
  sources.push({
    repo: baseline.repo,
    baseline: baseline.baseline,
    eligible: eligible.size,
  });
  for (const path of [...eligible].sort()) {
    const file = `${baseline.repo}/${path}`;
    let prepared, after: string, gaps: Set<number>;
    try {
      const before = (
        await exec(
          "git",
          ["-C", repoRoot, "show", `${baseline.baseline}:${path}`],
          { maxBuffer: 100_000_000 },
        )
      ).stdout;
      after = await readFile(join(repoRoot, path), "utf8");
      prepared = await prepare(path, before);
      if (prepared.normalized !== before)
        throw new Error(
          "Baseline normalization changed; incompatible oxfmt version/config",
        );
      gaps = spacingAt(prepared.lines, after);
    } catch (error) {
      excluded++;
      await failures.write({ file, error: String(error) });
      continue;
    }
    const group = hash(prepared.lines.join("\n"));
    const split = splitFor(group, values.seed, evalPercent, testPercent);
    stats[split].files++;
    if (!groups.has(group)) {
      groups.add(group);
      stats[split].groups++;
    }
    let emitted = 0;
    for (const boundary of prepared.boundaries) {
      const input = windows(prepared.lines, boundary, context);
      const id = hash(JSON.stringify(input));
      const label = Number(gaps.has(boundary)) as 0 | 1;
      const originalLabel = Number(prepared.existing.includes(boundary)) as
        | 0
        | 1;
      const previous = seen.get(id);
      if (previous) {
        duplicates++;
        if (previous.split !== split) crossSplitDuplicates++;
        if (previous.label !== label) conflictingDuplicates++;
        continue;
      }
      seen.set(id, { split, label });
      const example: Example = {
        id,
        file,
        group,
        boundary,
        ...input,
        label,
        originalLabel,
      };
      await writers[split].write(example);
      stats[split].examples++;
      stats[split].positive += label;
      stats[split].transitions[`${originalLabel}${label}`]++;
      emitted++;
    }
    await filesWriter.write({
      file,
      group,
      split,
      baseline: baseline.baseline,
      beforeHash: hash(prepared.original),
      afterHash: hash(after),
      boundaries: prepared.boundaries.length,
      emitted,
    });
    processed++;
    if (processed % 500 === 0)
      console.log(
        `${processed} files; ${seen.size} unique boundaries; ${duplicates} duplicate windows omitted`,
      );
  }
}
await Promise.all(
  [...Object.values(writers), filesWriter, failures].map((writer) =>
    writer.close(),
  ),
);
const metadata = {
  schema: 1,
  createdAt: new Date().toISOString(),
  context,
  seed: values.seed,
  splitTargets: {
    train: 100 - evalPercent - testPercent,
    eval: evalPercent,
    test: testPercent,
  },
  splitUnit:
    "sha256 of normalized file with formatting-only empty lines removed",
  deduplication:
    "Exact context windows: first occurrence in sorted repo/file order retained, later occurrences omitted across ALL splits. Conflicting duplicates retain first observed target.",
  labelSource:
    "Presence of a blank line in the actual processed after-state; originalLabel is audit/baseline-only, never a model feature",
  sources,
  processed,
  excluded,
  duplicates,
  crossSplitDuplicates,
  conflictingDuplicates,
  splits: stats,
};
if (Object.values(stats).some((stat) => !stat.examples))
  throw new Error("A split is empty; use a larger corpus or different seed");
await writeFile(
  join(output, "manifest.json"),
  JSON.stringify(metadata, null, 2),
);
await rm(join(output, "INCOMPLETE"));
console.log(JSON.stringify(metadata, null, 2));
