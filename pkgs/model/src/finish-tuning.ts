// Run only after tune.py has frozen selection.json and completed export.
import { readFile, writeFile, mkdir, cp, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { TreeSpacer } from "./tree-predict.ts";
import { jsonLines } from "./data.ts";
import { prepareDocument, closeParsers } from "@spcr/tree-sitter";

const { values } = parseArgs({
  options: {
    run: { type: "string", default: "tmp/tree-tuning" },
    baseline: { type: "string", default: "tmp/spacer-tree-sitter" },
    data: { type: "string", default: "tmp/model-encoded-tree-sitter" },
    out: { type: "string", default: "reports/tree-tuning" },
  },
});
const selection = JSON.parse(
  await readFile(join(values.run, "selection.json"), "utf8"),
);
const chosen = resolve(selection.selected),
  baseline = resolve(values.baseline);
const config = JSON.parse(await readFile(join(chosen, "config.json"), "utf8"));
if (
  config.threshold !== selection.threshold ||
  config.encodedManifestHash !== selection.encodedManifestHash
)
  throw new Error("Frozen selection no longer matches model configuration");
await mkdir(values.out, { recursive: true });
await cp(join(values.run, "protocol.md"), join(values.out, "protocol.md"));
await cp(join(values.run, "plan.json"), join(values.out, "plan.json"));
await cp(
  join(values.run, "selection.json"),
  join(values.out, "selection.json"),
);
const histories = [];
for (const candidate of selection.candidates) {
  try {
    histories.push({
      path: candidate.path,
      config: JSON.parse(
        await readFile(join(candidate.path, "config.json"), "utf8"),
      ),
      history: JSON.parse(
        await readFile(join(candidate.path, "history.json"), "utf8"),
      ),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
await writeFile(
  join(values.out, "histories.json"),
  JSON.stringify(histories, null, 2) + "\n",
);
if (chosen !== baseline) {
  const parity = JSON.parse(
    await readFile(join(chosen, "export-check.json"), "utf8"),
  );
  if (!parity.passed) throw new Error("Export parity did not pass");
  // O_EXCL makes repeat test evaluation an explicit error, including after a failed attempt.
  await writeFile(join(values.run, "TEST-OPENED"), new Date().toISOString(), {
    flag: "wx",
  });
  const evaluation = spawnSync(
    process.execPath,
    ["pkgs/model/src/evaluate.ts", "--data", values.data, "--model", chosen],
    { stdio: "inherit" },
  );
  if (evaluation.status !== 0)
    throw new Error(
      "Final evaluation failed; inspect the failure before any rerun",
    );
}
const quality = {
  baseline: JSON.parse(
    await readFile(join(baseline, "test-report.json"), "utf8"),
  ),
  selected: JSON.parse(
    await readFile(join(chosen, "test-report.json"), "utf8"),
  ),
};
// A deterministic, corpus-wide training-file sample. No test examples/errors are inspected.
const candidates: { path: string; hash: string }[] = [];
for await (const row of jsonLines<{ file: string; split: string }>(
  "tmp/model-corpus-ordered/files.jsonl",
)) {
  if (row.split !== "train") continue;
  const [owner, repo, ...parts] = row.file.split("/");
  candidates.push({
    path: join("tmp", `${owner}--${repo}`, ...parts),
    hash: createHash("sha256").update(`speed-v1:${row.file}`).digest("hex"),
  });
}
candidates.sort((a, b) => a.hash.localeCompare(b.hash));
const paths: string[] = [],
  excluded: string[] = [];
for (const { path } of candidates) {
  try {
    await prepareDocument(await readFile(path, "utf8"), path);
    paths.push(path);
  } catch {
    excluded.push(path);
  }
  if (paths.length === 1000) break;
}
await closeParsers();
const throughput = [];
for (let repeat = 0; repeat < 3; repeat++) {
  for (const [name, root] of repeat % 2 === 0
    ? [
        ["baseline", baseline],
        ["selected", chosen],
      ]
    : [
        ["selected", chosen],
        ["baseline", baseline],
      ]) {
    const model = await TreeSpacer.load(root);
    let bytes = 0,
      lines = 0;
    const hash = createHash("sha256"),
      started = performance.now();
    try {
      for (const path of paths) {
        const source = await readFile(path, "utf8");
        bytes += Buffer.byteLength(source);
        lines += source.split("\n").length - Number(source.endsWith("\n"));
        hash.update(source);
        await model.format(source, path);
      }
      const elapsedMs = performance.now() - started;
      throughput.push({
        name,
        repeat,
        files: paths.length,
        bytes,
        lines,
        sourceSha256: hash.digest("hex"),
        elapsedMs,
        bytesPerSecond: (bytes * 1000) / elapsedMs,
        locPerSecond: (lines * 1000) / elapsedMs,
      });
    } finally {
      model.dispose();
      await closeParsers();
    }
  }
}
const report = {
  selection,
  quality,
  throughput,
  excluded,
  parameters: config.parameters,
  weightsBytes: (await stat(join(chosen, "best/weights.bin"))).size,
  methodology:
    "Selection and threshold frozen on validation before one final test evaluation. Speed: identical deterministic hash-sampled training files, three alternating-order repeats, full formatting including reads and syntax verification, excluding model loading and output writes. No model selection based on test or speed results.",
};
await writeFile(
  join(values.out, "results.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
