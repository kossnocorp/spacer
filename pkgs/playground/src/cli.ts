import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { discover } from "./files.ts";
import {
  Spacer,
  prepare,
  render,
  writeResult,
  options,
  parallel,
  type Prepared,
} from "./formatter.ts";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      context: { type: "string" },
      threshold: { type: "string" },
      "batch-size": { type: "string" },
      concurrency: { type: "string" },
      model: { type: "string" },
      cache: { type: "string" },
      config: { type: "string" },
      report: { type: "string" },
      check: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(`Usage: fnox exec -- node pkgs/playground/src/cli.ts DIRECTORY [options]
Recursively format .ts/.tsx/.mts/.cts files in place.
  --context 5        Retained context lines on EACH side of a boundary
  --threshold 55     Minimum yes probability, in percent (0–100)
  --batch-size 128   Questions per request
  --concurrency 8    Simultaneous API requests
  --model jev-latest
  --cache PATH       Cache probability responses for repeatable reruns
  --config PATH      JSON oxfmt options (otherwise oxfmt defaults)
  --report PATH      Write decisions as JSON
  --check            Do not write; exit 1 if formatting differs
Respects nested .gitignore and .spacerignore; skips dependencies/build outputs.`);
  } else {
    if (positionals.length !== 1)
      throw new Error("Specify one directory; see --help");
    const config = options({
      ...(values.context !== undefined && { context: Number(values.context) }),
      ...(values.threshold !== undefined && {
        threshold: Number(values.threshold),
      }),
      ...(values["batch-size"] !== undefined && {
        batchSize: Number(values["batch-size"]),
      }),
      ...(values.concurrency !== undefined && {
        concurrency: Number(values.concurrency),
      }),
      ...(values.model && { model: values.model }),
      ...(values.cache && { cache: resolve(values.cache) }),
      ...(values.config && {
        oxfmt: JSON.parse(await readFile(values.config, "utf8")),
      }),
    });
    const paths = await discover(resolve(positionals[0]));
    let changed = 0;
    const spacer = new Spacer(config);
    const report = [];
    // Bound memory while still sharing request concurrency across small files.
    for (let start = 0; start < paths.length; start += 32) {
      const files: Prepared[] = [];
      await parallel(paths.slice(start, start + 32), 8, async (path, i) => {
        files[i] = await prepare(
          path,
          await readFile(path, "utf8"),
          config.oxfmt,
        );
      });
      await spacer.score(files);
      for (const file of files) {
        const output = render(file, config.threshold);
        if (output !== file.original) {
          changed++;
          if (!values.check) await writeResult(file, output);
        }
        if (values.report)
          report.push({ file: file.file, probabilities: file.probabilities });
      }
      console.error(
        `${Math.min(start + 32, paths.length)}/${paths.length} files, ${changed} changed, ${spacer.requests} requests`,
      );
    }
    if (values.report)
      await writeFile(
        values.report,
        JSON.stringify(
          { config, models: [...spacer.models], files: report },
          null,
          2,
        ),
      );
    console.log(
      `${paths.length} files processed; ${changed} ${values.check ? "would change" : "changed"}.`,
    );
    if (values.check && changed) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
