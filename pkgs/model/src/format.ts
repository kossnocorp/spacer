import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { discover } from "@spacer/playground/files";
import {
  prepare,
  render,
  writeResult,
  parallel,
  type Prepared,
} from "@spacer/playground";
import { LocalSpacer } from "./predict.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: "tmp/model-run" },
    threshold: { type: "string" },
    "batch-size": { type: "string", default: "512" },
    check: { type: "boolean" },
  },
});
if (positionals.length !== 1)
  throw new Error(
    "Usage: node pkgs/model/src/format.ts DIRECTORY --model tmp/model-run [--threshold PERCENT] [--check]",
  );
const local = await LocalSpacer.load(resolve(values.model));
try {
  const threshold =
    values.threshold === undefined
      ? local.threshold * 100
      : Number(values.threshold);
  const batchSize = Number(values["batch-size"]);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)
    throw new Error("threshold must be between 0 and 100 percent");
  const paths = await discover(resolve(positionals[0]));
  let changed = 0;
  for (let start = 0; start < paths.length; start += 32) {
    const files: Prepared[] = [];
    await parallel(paths.slice(start, start + 32), 8, async (path, i) => {
      files[i] = await prepare(path, await readFile(path, "utf8"));
    });
    await local.score(files, batchSize);
    for (const file of files) {
      const output = render(file, threshold);
      if (output !== file.original) {
        changed++;
        if (!values.check) await writeResult(file, output);
      }
    }
    console.error(
      `${Math.min(start + 32, paths.length)}/${paths.length}; ${changed} ${values.check ? "would change" : "changed"}`,
    );
  }
  if (values.check && changed) process.exitCode = 1;
  console.log(
    `${paths.length} files; ${changed} changed; local model only, no API requests`,
  );
} finally {
  local.dispose();
}
