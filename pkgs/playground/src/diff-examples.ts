import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve("tmp/full-run");
const selection = JSON.parse(
  await readFile("tmp/experiments/evaluation/summary.json", "utf8"),
);
const examples: {
  repo: string;
  path: string;
  oldStart: number;
  newStart: number;
  diff: string;
  score: number;
}[] = [];
const alternatives = new Map<string, typeof examples>();
await mkdir(join(root, "examples"), { recursive: true });

for (const repo of selection.repositories) {
  const slug = repo.repo.replace("/", "--");
  const baseline = JSON.parse(
    await readFile(join(root, `${slug}.baseline.json`), "utf8"),
  );
  const candidates: typeof examples = [];
  for (const file of repo.files) {
    const { stdout } = await exec(
      "git",
      [
        "-C",
        resolve("tmp", slug),
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--unified=24",
        baseline.baseline,
        "--",
        file.path,
      ],
      { maxBuffer: 10_000_000 },
    );
    const lines = stdout.split("\n");
    for (let h = 0; h < lines.length; h++) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(lines[h]);
      if (!match) continue;
      let end = h + 1;
      while (end < lines.length && /^[ +\-]/.test(lines[end])) end++;
      const body = lines.slice(h + 1, end);
      for (let offset = 0; offset + 45 <= body.length; offset++) {
        const window = body.slice(offset, offset + 45);
        const changes = window.filter((line) => /^[+\-]/.test(line));
        if (!changes.length || window.some((line) => line.length > 150))
          continue;
        const score =
          changes.length * 3 -
          window.filter((line) => !line.slice(1).trim()).length * 0.2 -
          window.filter((line) => /^\s*\*/.test(line.slice(1))).length * 0.3;
        const oldStart =
          +match[1] +
          body.slice(0, offset).filter((line) => !line.startsWith("+")).length;
        const newStart =
          +match[2] +
          body.slice(0, offset).filter((line) => !line.startsWith("-")).length;
        const oldCount = window.filter((line) => !line.startsWith("+")).length;
        const newCount = window.filter((line) => !line.startsWith("-")).length;
        candidates.push({
          repo: repo.repo,
          path: file.path,
          oldStart,
          newStart,
          score,
          diff: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${window.join("\n")}`,
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length)
    throw new Error(`No 45-line changed excerpt found for ${repo.repo}`);
  examples.push(candidates[0]);
  alternatives.set(
    repo.repo,
    candidates.filter((candidate) => candidate.path !== candidates[0].path),
  );
}
for (const repo of [
  "microsoft/vscode",
  "angular/angular",
  "immich-app/immich",
  "hoppscotch/hoppscotch",
  "tailwindlabs/tailwindcss",
]) {
  const candidate = alternatives.get(repo)?.[0];
  if (!candidate) throw new Error(`No second example found for ${repo}`);
  examples.push(candidate);
}
await writeFile(join(root, "examples.json"), JSON.stringify(examples, null, 2));
await writeFile(
  join(root, "examples.md"),
  examples
    .map(
      (example, index) =>
        `## ${index + 1}. ${example.repo} — ${example.path}\n\n\`\`\`diff\n${example.diff}\n\`\`\`\n`,
    )
    .join("\n"),
);
for (const [index, example] of examples.entries())
  await writeFile(
    join(root, "examples", `${String(index + 1).padStart(2, "0")}.diff`),
    `--- a/${example.path}\n+++ b/${example.path}\n${example.diff}\n`,
  );
console.log(`Wrote ${examples.length} examples, each with 45 diff-body lines.`);
