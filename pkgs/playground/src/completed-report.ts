import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prepare } from "./formatter.ts";

const exec = promisify(execFile);
const output = resolve("reports/completed-work");
const root = resolve("tmp/microsoft--vscode");
await mkdir(output, { recursive: true });
const summary = JSON.parse(await readFile("tmp/full-run/summary.json", "utf8"));
const repo = summary.repositories.find(
  (row: any) => row.repo === "microsoft/vscode",
);
const rows = JSON.parse(
  await readFile("tmp/full-run/microsoft--vscode.files.json", "utf8"),
);
const selected = [
  "extensions/git/src/main.ts",
  "extensions/git/src/askpass.ts",
  "extensions/git/src/staging.ts",
  "extensions/typescript-language-features/src/filesystems/autoInstallerFs.ts",
  "extensions/typescript-language-features/src/utils/async.ts",
  "extensions/typescript-language-features/src/languageFeatures/signatureHelp.ts",
  "src/vs/base/common/comparers.ts",
  "src/vs/base/common/objects.ts",
  "src/vs/base/common/image.ts",
  "src/vs/base/common/sseParser.ts",
  "src/vs/base/common/jsonFormatter.ts",
  "src/vs/base/common/uriTemplate.ts",
  "src/vs/editor/common/viewEventHandler.ts",
  "src/vs/editor/common/services/languageFeatures.ts",
  "src/vs/editor/common/core/textChange.ts",
  "src/vs/editor/common/editorContextKeys.ts",
  "src/vs/editor/common/languages/linkComputer.ts",
  "src/vs/platform/agentHost/browser/nullAgentHostService.ts",
  "src/vs/platform/agentHost/common/webPubSub/chunking.ts",
  "src/vs/platform/files/common/diskFileSystemProviderClient.ts",
  "src/vs/platform/agentHost/common/meta/vscode/agentUsageMeta.ts",
  "src/vs/platform/theme/common/sizes/baseSizes.ts",
  "src/vs/workbench/contrib/debug/common/nullDebugService.ts",
  "src/vs/workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.ts",
  "src/vs/workbench/contrib/terminal/browser/terminalConfigurationService.ts",
  "extensions/copilot/src/platform/telemetry/common/telemetry.ts",
  "extensions/copilot/src/platform/notebook/common/alternativeContentProvider.xml.ts",
  "extensions/copilot/src/platform/configuration/common/validator.ts",
  "extensions/copilot/src/platform/workspaceChunkSearch/node/codeSearch/workspaceDiff.ts",
  "extensions/copilot/src/platform/promptFiles/vscode-node/agentInstructionsLocator.ts",
];
const progress = new Map<string, any>();
for await (const line of createInterface({
  input: createReadStream("tmp/full-run/microsoft--vscode.progress.jsonl"),
  crlfDelay: Infinity,
})) {
  const record = JSON.parse(line);
  if (selected.includes(record.path)) progress.set(record.path, record);
}
const examples = [];
for (const [index, path] of selected.entries()) {
  const row = rows.find((row: any) => row.path === path);
  if (row?.status !== "formatted")
    throw new Error(`File not completed: ${path}`);
  const before = (
    await exec("git", ["-C", root, "show", `${repo.baseline}:${path}`], {
      maxBuffer: 10_000_000,
    })
  ).stdout;
  const after = await readFile(join(root, path), "utf8");
  if (
    before
      .split("\n")
      .filter((line) => line.trim())
      .join("\n") !==
    after
      .split("\n")
      .filter((line) => line.trim())
      .join("\n")
  )
    throw new Error(`Non-spacing change in ${path}`);
  const diff = (
    await exec(
      "git",
      [
        "-C",
        root,
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--unified=24",
        repo.baseline,
        "--",
        path,
      ],
      { maxBuffer: 10_000_000 },
    )
  ).stdout;
  const diffLines = diff.split("\n");
  const windows = [];
  for (let h = 0; h < diffLines.length; h++) {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(diffLines[h]);
    if (!match) continue;
    let end = h + 1;
    while (end < diffLines.length && /^[ +\-]/.test(diffLines[end])) end++;
    const body = diffLines.slice(h + 1, end);
    for (let offset = 0; offset + 45 <= body.length; offset++) {
      const excerpt = body.slice(offset, offset + 45);
      const changes = excerpt.filter((line) => /^[+\-]/.test(line)).length;
      if (!changes || excerpt.some((line) => line.length > 155)) continue;
      const oldStart =
        +match[1] +
        body.slice(0, offset).filter((line) => !line.startsWith("+")).length;
      const newStart =
        +match[2] +
        body.slice(0, offset).filter((line) => !line.startsWith("-")).length;
      const oldCount = excerpt.filter((line) => !line.startsWith("+")).length;
      const newCount = excerpt.filter((line) => !line.startsWith("-")).length;
      const score =
        changes * 3 -
        excerpt.filter((line) => !line.slice(1).trim()).length * 0.2 -
        excerpt.filter((line) => /^\s*\*/.test(line.slice(1))).length * 0.3;
      windows.push({
        score,
        oldStart,
        newStart,
        oldCount,
        newCount,
        body: excerpt,
      });
    }
  }
  windows.sort((a, b) => b.score - a.score);
  if (!windows.length) throw new Error(`No 45-line excerpt in ${path}`);
  const window = windows[0];
  const prepared = await prepare(join(root, path), before);
  const raw = before.split("\n");
  let cursor = 0;
  const positions = new Map<number, number>();
  const existing: {
    line: number;
    probability: number | null;
    inserted: boolean;
    originallyPresent: boolean;
  }[] = [];
  for (let i = 0; i < raw.length && cursor < prepared.lines.length; i++) {
    if (raw[i] === prepared.lines[cursor]) {
      positions.set(cursor++, i + 1);
    } else if (raw[i].trim())
      throw new Error(`Cannot map normalized positions in ${path}`);
  }
  for (const boundary of new Set([
    ...prepared.existing,
    ...prepared.boundaries,
  ])) {
    const line = positions.get(boundary)!;
    const probability = progress.get(path).probabilities[boundary] ?? null;
    const inserted = probability !== null && probability >= 0.55;
    const originallyPresent = prepared.existing.includes(boundary);
    if (
      inserted !== originallyPresent &&
      line >= window.oldStart &&
      line < window.oldStart + window.oldCount
    )
      existing.push({ line, probability, inserted, originallyPresent });
  }
  examples.push({
    number: index + 1,
    path,
    ...row,
    oldStart: window.oldStart,
    newStart: window.newStart,
    decisions: existing,
    diff: `@@ -${window.oldStart},${window.oldCount} +${window.newStart},${window.newCount} @@\n${window.body.join("\n")}`,
  });
}
await writeFile(
  join(output, "examples.json"),
  JSON.stringify(examples, null, 2),
);
const csv = [
  "file,baseline_lines,added_lines,deleted_lines,changed_lines,changed_percent",
  ...rows
    .filter((row: any) => row.status === "formatted")
    .map((row: any) =>
      [
        row.path,
        row.baselineLines,
        row.added,
        row.deleted,
        row.changed,
        row.percent.toFixed(4),
      ]
        .map((value) => JSON.stringify(value))
        .join(","),
    ),
];
await writeFile(join(output, "files.csv"), csv.join("\n") + "\n");
await writeFile(
  join(output, "coverage.json"),
  JSON.stringify(summary, null, 2),
);
let analyses: Record<string, string> = {};
try {
  analyses = JSON.parse(await readFile(join(output, "analyses.json"), "utf8"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const nf = (value: number) => value.toLocaleString("en-US");
const report = [
  "# Completed-work spacing report",
  "",
  "**Partial repository coverage:** no repository completed the entire spacing pass. This report covers the 12,577 completed VS Code files. All 25 oxfmt baseline commits exist; the other 24 repositories have not started the full spacing pass. No new API requests were made to generate this report.",
  "",
  `Baseline: \`${repo.baseline}\`. Compare Spacer against this oxfmt commit, not against upstream raw formatting. Context: 5 retained lines on each side; threshold: 55%; request concurrency: 16.`,
  "",
  "## Totals",
  "",
  "| Metric | VS Code completed subset |",
  "| --- | ---: |",
  `| Files formatted | ${nf(repo.processed)} |`,
  `| Files with spacing changes | ${nf(repo.changedFiles)} |`,
  `| Unchanged completed files | ${nf(repo.processed - repo.changedFiles)} |`,
  `| Baseline lines in completed files | ${nf(repo.processedLines)} |`,
  `| Added lines | ${nf(repo.added)} |`,
  `| Deleted lines | ${nf(repo.deleted)} |`,
  `| Absolute changed lines | ${nf(repo.changed)} |`,
  `| Changed / completed baseline lines | ${repo.processedPercent.toFixed(2)}% |`,
  `| Changed / all VS Code baseline TS lines (partial-run figure) | ${repo.percent.toFixed(2)}% |`,
  `| Remaining unprocessed VS Code files | ${nf(repo.notProcessed)} |`,
  `| Excluded VS Code files | ${nf(repo.failed)} |`,
  "",
  "Changed lines means **added + deleted**, so relocating a blank line counts as two changed lines. Percentages divide by the oxfmt baseline line count, including blank lines. Repository totals use sums, not the mean of file percentages. Exclusions: 21 initial parse failures, 92 non-idempotent oxfmt inputs, 3 questions exceeding the individual API context limit. Excluded files are not included in the completed-subset denominator.",
  "",
  "[Complete per-file results for all 12,577 completed files](files.csv) · [All repository coverage and baseline commits](coverage.json)",
  "",
  "## Example-file metrics",
  "",
  "These 30 files were deliberately chosen from different subsystems to expose contrasting behaviors; examples are not a random accuracy sample. Each excerpt has 45 diff-body lines plus its hunk header. A bare `+` or `-` is an added or removed blank line. Metrics below cover the entire file, not just its excerpt.",
  "",
  "| # | File | Baseline lines | + | − | Absolute | % |",
  "| ---: | --- | ---: | ---: | ---: | ---: | ---: |",
  ...examples.map(
    (example) =>
      `| ${example.number} | ${example.path} | ${example.baselineLines} | ${example.added} | ${example.deleted} | ${example.changed} | ${example.percent.toFixed(2)}% |`,
  ),
  "",
  "## Interpretation",
  "",
  "The original blank-line decisions are removed before inference. Jev reconstructs a generic style from local context, so it cannot preserve a repository convention merely because it was present. Model probabilities below are recorded Noul outputs, not explanations. A missing probability means the parser did not submit that boundary; removal there is structural rather than an AI judgment. The explanations are hypotheses informed by the code and these recorded decisions.",
  "",
  "### Main findings",
  "",
  "1. **Candidate generation causes irreversible losses.** Grouped array entries and region-comment spacing disappear without a model decision (examples 4, 10, 17, 20, 25). This is not something a better prompt alone can fix.",
  "2. **The policy is syntax-heavy, not repository-style-aware.** Fields and constant tables are compressed while methods and signatures are expanded, including repetitive stubs (14, 18, 19, 22, 23, 26).",
  "3. **Independent windows do not enforce consistency.** Mirrored loops get different spacing (8), some identical empty methods remain adjacent while others are separated (23), and a variable/check pair may be split in one context but joined in another (2, 21, 30).",
  "4. **A hard threshold amplifies small differences.** Several meaningful boundaries are removed at 53–54%, while additions at exactly 55% are accepted (3, 5, 12, 19, 27, 28, 30). These probabilities are not proof of formatting quality.",
  "5. **Some deviations are reasonable improvements.** JPEG parsing, chunk construction and asynchronous playback gain useful phase separation (9, 19, 24). Agreement with the baseline should not be treated as an accuracy score.",
  "",
  "### Priorities for a later iteration",
  "",
  "First distinguish structural no-space boundaries from unmodeled-but-valid boundaries, including array groups and region headings. Then make a shared style decision for repetitive runs (fields, methods, registration tables), rather than judging every boundary in isolation. Finally evaluate a wider-context or second-pass consistency check for borderline decisions. These are recommendations from this report; no formatter policy was changed while generating it.",
  "",
  ...examples.flatMap((example) => [
    `## ${example.number}. ${example.path}`,
    "",
    `Whole file: **+${example.added} / −${example.deleted} = ${example.changed} changed lines (${example.percent.toFixed(2)}%)** of ${example.baselineLines} baseline lines.`,
    "",
    "```diff",
    example.diff,
    "```",
    "",
    `**Analysis:** ${analyses[String(example.number)] ?? "Analysis pending."}`,
    "",
    `**Recorded decisions (following code line within excerpt):** ${example.decisions.map((decision: any) => `before baseline L${decision.line}: ${decision.probability === null ? "not submitted (structural exclusion)" : (decision.probability * 100).toFixed(0) + "% yes"}, ${decision.inserted ? "added" : "removed"}`).join("; ") || "No mapped decision inside this window."}.`,
    "",
  ]),
];
await writeFile(join(output, "REPORT.md"), report.join("\n") + "\n");
console.log(
  `Wrote ${examples.length} 45-line excerpts and ${repo.processed} completed-file metrics to ${output}`,
);
