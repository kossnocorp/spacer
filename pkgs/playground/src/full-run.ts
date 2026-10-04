import { readFile, writeFile, appendFile, mkdir, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { resolve, join, relative } from "node:path";
import { execFile, spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { format } from "oxfmt";
import { discover } from "./files.ts";
import {
  Spacer,
  prepare,
  render,
  writeResult,
  parallel,
  defaults,
} from "./formatter.ts";

const exec = promisify(execFile);
const root = resolve("tmp");
const output = join(root, "full-run");
await mkdir(output, { recursive: true });
const repos: { repo: string; commit: string }[] = JSON.parse(
  await readFile(join(root, "repos.json"), "utf8"),
);
const slug = (name: string) => name.replace("/", "--");
const git = async (dir: string, ...args: string[]) =>
  (await exec("git", ["-C", dir, ...args], { maxBuffer: 100_000_000 })).stdout;
const saveDiff = async (dir: string, baseline: string, path: string) => {
  const child = spawn(
    "git",
    [
      "-C",
      dir,
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--unified=24",
      baseline,
      "--",
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const completed = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`git diff exited ${code}`)),
    );
  });
  await Promise.all([
    pipeline(child.stdout!, createWriteStream(path)),
    completed,
  ]);
};
const lineCount = (text: string) =>
  text.length ? text.split("\n").length - Number(text.endsWith("\n")) : 0;
type BaselineFile = { path: string; lines: number; error?: string };
type Baseline = {
  repo: string;
  upstream: string;
  baseline: string;
  files: BaselineFile[];
  changed: number;
};
const load = async (repo: string): Promise<Baseline> =>
  JSON.parse(
    await readFile(join(output, `${slug(repo)}.baseline.json`), "utf8"),
  );

if (process.argv[2] === "baseline") {
  await parallel(repos, 3, async ({ repo, commit }) => {
    const dir = join(root, slug(repo));
    await git(dir, "reset", "--hard", commit);
    await git(dir, "clean", "-fd");
    const tracked = new Set((await git(dir, "ls-files", "-z")).split("\0"));
    const paths = (await discover(dir)).filter((path) =>
      tracked.has(relative(dir, path)),
    );
    const files: BaselineFile[] = [];
    let changed = 0;
    await parallel(paths, 8, async (path, index) => {
      const before = await readFile(path, "utf8");
      const result = await format(path, before, { endOfLine: "lf" });
      const file: BaselineFile = {
        path: relative(dir, path),
        lines: lineCount(before),
      };
      if (result.errors.length)
        file.error = result.errors.map((error) => error.message).join("; ");
      else {
        file.lines = lineCount(result.code);
        if (before !== result.code) {
          await writeFile(path, result.code);
          changed++;
        }
      }
      files[index] = file;
    });
    await git(dir, "add", "-u");
    await git(
      dir,
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "user.name=Spacer Experiment",
      "-c",
      "user.email=spacer@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-m",
      "chore: normalize TypeScript with oxfmt for spacing baseline",
    );
    const baseline = (await git(dir, "rev-parse", "HEAD")).trim();
    await writeFile(
      join(output, `${slug(repo)}.baseline.json`),
      JSON.stringify({
        repo,
        upstream: commit,
        baseline,
        changed,
        files,
      } satisfies Baseline),
    );
    await rm(join(output, `${slug(repo)}.progress.jsonl`), { force: true });
    console.log(
      `${repo}: ${paths.length} TS files, ${changed} normalized, ${files.filter((file) => file.error).length} parse failures, baseline ${baseline}`,
    );
  });
} else if (process.argv[2] === "space") {
  const spacer = new Spacer({ cache: join(output, "cache"), concurrency: 16 });
  const start = Date.now();
  for (const { repo } of repos) {
    const baseline = await load(repo);
    const dir = join(root, slug(repo));
    if ((await git(dir, "rev-parse", "HEAD")).trim() !== baseline.baseline)
      throw new Error(`Unexpected HEAD in ${repo}`);
    const progressPath = join(output, `${slug(repo)}.progress.jsonl`);
    let progress: { path: string; error?: string }[] = [];
    try {
      progress = (await readFile(progressPath, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const completed = new Set(progress.map((file) => file.path));
    const remaining = baseline.files.filter(
      (file) => !file.error && !completed.has(file.path),
    );
    for (let offset = 0; offset < remaining.length; offset += 64) {
      const files: Awaited<ReturnType<typeof prepare>>[] = [];
      const errors: { path: string; error: string }[] = [];
      await parallel(remaining.slice(offset, offset + 64), 8, async (file) => {
        const path = join(dir, file.path);
        try {
          const prepared = await prepare(path, await readFile(path, "utf8"));
          if (prepared.original !== prepared.normalized)
            throw new Error(
              "oxfmt baseline is not idempotent; excluded to keep diff spacing-only",
            );
          files.push(prepared);
        } catch (error) {
          errors.push({ path: file.path, error: String(error) });
        }
      });
      files.sort((a, b) => a.file.localeCompare(b.file));
      while (files.length) {
        try {
          await spacer.score(files);
          break;
        } catch (error) {
          const sourceFile = (error as { sourceFile?: string }).sourceFile;
          if (!sourceFile) throw error;
          errors.push({
            path: relative(dir, sourceFile),
            error: String(error),
          });
          files.splice(
            files.findIndex((file) => file.file === sourceFile),
            1,
          );
        }
      }
      const records: unknown[] = [...errors];
      for (const file of files) {
        const formatted = render(file, spacer.config.threshold);
        await writeResult(file, formatted);
        records.push({
          path: relative(dir, file.file),
          questions: file.boundaries.length,
          changed: formatted !== file.original,
          probabilities: file.probabilities,
        });
      }
      await appendFile(
        progressPath,
        records.map((record) => JSON.stringify(record)).join("\n") + "\n",
      );
      console.log(
        `${repo}: ${Math.min(offset + 64, remaining.length)}/${remaining.length} remaining files; total ${spacer.questions} questions, ${spacer.requests} requests, ${Math.round((Date.now() - start) / 1000)}s`,
      );
    }
    await saveDiff(dir, baseline.baseline, join(output, `${slug(repo)}.diff`));
    console.log(`DONE ${repo}`);
  }
  await writeFile(
    join(output, "usage.json"),
    JSON.stringify(
      {
        config: spacer.config,
        models: [...spacer.models],
        requests: spacer.requests,
        questions: spacer.questions,
        inputTokens: spacer.inputTokens,
        outputTokens: spacer.outputTokens,
        elapsedMs: Date.now() - start,
      },
      null,
      2,
    ),
  );
} else if (process.argv[2] === "report") {
  const summary = [];
  const csv = [
    "repo,file,status,baseline_lines,added_lines,deleted_lines,changed_lines,changed_percent",
  ];
  for (const { repo } of repos) {
    const baseline = await load(repo);
    const dir = join(root, slug(repo));
    const progressText = await readFile(join(output, `${slug(repo)}.progress.jsonl`), "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return ""; throw error; });
    const progress = progressText
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const statuses = new Map(progress.map((file) => [file.path, file]));
    const fields = (
      await git(
        dir,
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--numstat",
        "-z",
        baseline.baseline,
        "--",
      )
    )
      .split("\0")
      .filter(Boolean);
    const changes = new Map(
      fields.map((field) => {
        const [added, deleted, ...path] = field.split("\t");
        return [
          path.join("\t"),
          { added: Number(added), deleted: Number(deleted) },
        ] as const;
      }),
    );
    let lines = 0,
      added = 0,
      deleted = 0,
      changedFiles = 0,
      skipped = 0,
      processed = 0,
      processedLines = 0,
      notProcessed = 0;
    const rows = baseline.files.map((file) => {
      const change = changes.get(file.path) ?? { added: 0, deleted: 0 };
      const status = file.error
        ? "oxfmt-error"
        : statuses.get(file.path)?.error
          ? "spacing-error"
          : statuses.has(file.path)
            ? "formatted"
            : "not-processed";
      if (status !== "formatted") skipped++;
      else { processed++; processedLines += file.lines; }
      if (status === "not-processed") notProcessed++;
      lines += file.lines;
      added += change.added;
      deleted += change.deleted;
      const changed = change.added + change.deleted;
      if (changed) changedFiles++;
      const percent = status === "formatted" ? (file.lines ? (changed / file.lines) * 100 : 0) : null;
      const row = {
        repo,
        path: file.path,
        status,
        baselineLines: file.lines,
        ...change,
        changed,
        percent,
        error: file.error ?? statuses.get(file.path)?.error,
      };
      csv.push(
        [
          repo,
          file.path,
          status,
          file.lines,
          change.added,
          change.deleted,
          changed,
          percent?.toFixed(4) ?? "",
        ]
          .map((value) => JSON.stringify(value))
          .join(","),
      );
      return row;
    });
    await writeFile(
      join(output, `${slug(repo)}.files.json`),
      JSON.stringify(rows),
    );
    const markdown = [
      `# ${repo}: per-file spacing changes`,
      "",
      `Baseline commit: \`${baseline.baseline}\`. Changed lines = added + deleted; percentage = changed / baseline lines × 100.`,
      "",
      "| File | Status | Baseline lines | Added | Deleted | Changed | Changed % |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
      ...rows.map(
        (row) =>
          `| ${row.path.replaceAll("|", "\\|")} | ${row.status} | ${row.baselineLines} | ${row.added} | ${row.deleted} | ${row.changed} | ${row.percent === null ? "—" : row.percent.toFixed(2) + "%"} |`,
      ),
    ];
    await writeFile(
      join(output, `${slug(repo)}.files.md`),
      markdown.join("\n") + "\n",
    );
    summary.push({
      repo,
      upstream: baseline.upstream,
      baseline: baseline.baseline,
      files: rows.length,
      changedFiles,
      skipped,
      processed,
      notProcessed,
      failed: skipped - notProcessed,
      processedLines,
      lines,
      added,
      deleted,
      changed: added + deleted,
      percent: processed ? ((added + deleted) / (lines || 1)) * 100 : null,
      processedPercent: processed ? ((added + deleted) / (processedLines || 1)) * 100 : null,
    });
  }
  await writeFile(join(output, "files.csv"), csv.join("\n") + "\n");
  await writeFile(
    join(output, "summary.json"),
    JSON.stringify({ complete: summary.every(repo => repo.notProcessed === 0), defaults, repositories: summary }, null, 2),
  );
  console.table(summary.map(({ upstream, baseline, ...row }) => row));
} else
  throw new Error(
    "Usage: node pkgs/playground/src/full-run.ts baseline|space|report (from workspace root)",
  );
