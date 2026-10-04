import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import ts from "typescript";
import { discover } from "./files.ts";
import { repositories } from "./repos.ts";
import {
  Spacer,
  prepare,
  render,
  parallel,
  type Prepared,
} from "./formatter.ts";
import { baselinePrompt, detailedPrompt, spacingPrompt } from "./prompt.ts";

const count = Number(process.argv[2] ?? 5);
const label = process.argv[3] ?? "baseline";
const perRepo = Number(process.argv[4] ?? 3);
const out = resolve("tmp", "experiments", label);
await mkdir(out, { recursive: true });
const old = ["baseline", "tuned", "marked"].includes(label);
const boundaryMode = ["baseline", "tuned", "marked", "final"].includes(label)
  ? "all"
  : "syntax";
const spacer = new Spacer({
  prompt:
    label === "baseline"
      ? baselinePrompt
      : old
        ? detailedPrompt
        : spacingPrompt,
  threshold: old ? 65 : 55,
  questionStyle: ["baseline", "tuned"].includes(label) ? "windows" : "marked",
  cache: resolve("tmp/jev-cache"),
});
const selected: { repo: string; root: string; files: Prepared[] }[] = [];
for (const repo of repositories.slice(0, count)) {
  const root = resolve("tmp", repo.replace("/", "--"));
  const paths = (await discover(root)).filter(
    (path) =>
      !/(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__|generated|examples?|e2e)(?:\/)|\.(?:test|spec|d)\.ts$/.test(
        path,
      ),
  );
  // Stable hash sampling avoids alphabetic/index-file bias. No selection by blank-line style.
  paths.sort((a, b) =>
    createHash("sha256")
      .update(relative(root, a))
      .digest("hex")
      .localeCompare(
        createHash("sha256").update(relative(root, b)).digest("hex"),
      ),
  );
  const files: Prepared[] = [];
  for (const path of paths) {
    const text = await readFile(path, "utf8");
    const length = text.split("\n").length;
    if (
      length < 50 ||
      length > 220 ||
      /@generated|auto-generated|DO NOT EDIT/i.test(text.slice(0, 1000))
    )
      continue;
    try {
      files.push(await prepare(path, text, undefined, boundaryMode));
    } catch {
      continue;
    }
    if (files.length === perRepo) break;
  }
  selected.push({ repo, root, files });
}
console.log(
  `Scoring ${selected.reduce((n, x) => n + x.files.length, 0)} files across ${count} repositories`,
);
const started = Date.now();
await spacer.score(selected.flatMap((x) => x.files));
const exec = promisify(execFile);
const summaries: unknown[] = [];
const fingerprint = (code: string, path: string) => {
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true);
  const tokens: string[] = [];
  const visit = (node: ts.Node) => {
    const children = node.getChildren(source);
    if (children.length) children.forEach(visit);
    else tokens.push(`${node.kind}:${node.getText(source)}`);
  };
  visit(source);
  return JSON.stringify(tokens);
};
await parallel(selected, 5, async ({ repo, root, files }, index) => {
  const folder = join(out, repo.replace("/", "--"));
  await mkdir(folder, { recursive: true });
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  const details = [];
  for (const [i, file] of files.entries()) {
    const output = render(file, spacer.config.threshold);
    if (
      fingerprint(output, file.file) !== fingerprint(file.normalized, file.file)
    )
      throw new Error(`Token content changed in ${file.file}`);
    const again = await prepare(file.file, output, undefined, boundaryMode);
    if (
      JSON.stringify(again.lines) !== JSON.stringify(file.lines) ||
      JSON.stringify(again.boundaries) !== JSON.stringify(file.boundaries)
    )
      throw new Error(`Unstable formatting inputs in ${file.file}`);
    const normalizedPath = join(folder, `${i}.before.ts`),
      outputPath = join(folder, `${i}.after.ts`);
    await writeFile(normalizedPath, file.normalized);
    await writeFile(outputPath, output);
    let diff = "";
    try {
      diff = (
        await exec("git", [
          "diff",
          "--no-index",
          "--",
          normalizedPath,
          outputPath,
        ])
      ).stdout;
    } catch (error) {
      if ((error as { code: number }).code !== 1) throw error;
      diff = (error as { stdout: string }).stdout;
    }
    await writeFile(join(folder, `${i}.diff`), diff);
    for (const boundary of file.boundaries) {
      const before = file.existing.includes(boundary),
        after = file.probabilities[boundary] * 100 >= spacer.config.threshold;
      if (before && after) tp++;
      else if (after) fp++;
      else if (before) fn++;
      else tn++;
    }
    fn += file.existing.filter(
      (boundary) => !file.boundaries.includes(boundary),
    ).length;
    details.push({
      path: relative(root, file.file),
      boundaries: file.boundaries.length,
      existing: file.existing,
      probabilities: file.probabilities,
    });
  }
  summaries[index] = {
    repo,
    files: details,
    tp,
    fp,
    fn,
    tn,
    precision: tp / (tp + fp || 1),
    recall: tp / (tp + fn || 1),
  };
  console.log(
    `${repo}: ${files.length} files, kept ${tp}, added ${fp}, removed ${fn}`,
  );
});
await writeFile(
  join(out, "summary.json"),
  JSON.stringify(
    {
      label,
      boundaryMode,
      tokenIntegrity: true,
      stableInputs: true,
      config: spacer.config,
      models: [...spacer.models],
      elapsedMs: Date.now() - started,
      requests: spacer.requests,
      questions: spacer.questions,
      inputTokens: spacer.inputTokens,
      outputTokens: spacer.outputTokens,
      repositories: summaries,
    },
    null,
    2,
  ),
);
