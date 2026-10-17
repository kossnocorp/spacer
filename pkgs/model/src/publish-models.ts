import { mkdir, readFile, writeFile, cp, stat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { models } from "./catalog.ts";

const upload = process.argv.includes("--upload");
const root = "tmp/model-releases";
const releases = [];
for (const model of models) {
  // Export every trial, including those that were not selected for test evaluation.
  const exported = spawnSync(
    process.execPath,
    ["pkgs/model/src/rocm.ts", "export", "--out", model.directory],
    { stdio: "inherit" },
  );
  if (exported.status !== 0) throw new Error(`Export failed: ${model.id}`);
  const parity = JSON.parse(
    await readFile(join(model.directory, "export-check.json"), "utf8"),
  );
  if (!parity.passed) throw new Error(`Parity failed: ${model.id}`);
  const prefix = model.id.replace(/^spacer-/, "");
  const destination = join(root, prefix);
  await mkdir(join(destination, "best"), { recursive: true });
  const config = JSON.parse(
    await readFile(join(model.directory, "config.json"), "utf8"),
  );
  await writeFile(
    join(destination, "config.json"),
    JSON.stringify(
      { ...config, modelName: model.id, displayName: model.name },
      null,
      2,
    ) + "\n",
  );
  for (const file of [
    "best/model.json",
    "best/weights.bin",
    "export-check.json",
  ])
    await cp(join(model.directory, file), join(destination, file));
  const files = [];
  for (const file of [
    "config.json",
    "best/model.json",
    "best/weights.bin",
    "export-check.json",
  ]) {
    const data = await readFile(join(destination, file));
    files.push({
      file,
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
  const release = {
    id: model.id,
    name: model.name,
    description: model.description,
    family: model.family,
    bucket: "spacer-models",
    prefix,
    parameters: config.parameters,
    tokenizer: config.tokenizer,
    validation: config.validation,
    trainingLanguages: ["typescript", "tsx"],
    files,
  };
  await writeFile(
    join(destination, "release.json"),
    JSON.stringify(release, null, 2) + "\n",
  );
  if (upload) {
    for (const file of [...files.map((f) => f.file), "release.json"]) {
      const path = join(destination, file);
      console.log(`Uploading ${model.id}: ${file}`);
      const result = spawnSync(
        "cf",
        [
          "r2",
          "objects",
          "put",
          `${prefix}/${file}`,
          "--bucket-name",
          "spacer-models",
          "--file",
          path,
          "--content-type",
          file.endsWith(".json")
            ? "application/json"
            : "application/octet-stream",
          "--content-length",
          String((await stat(path)).size),
        ],
        { stdio: "inherit" },
      );
      if (result.status !== 0)
        throw new Error(`Upload failed: ${prefix}/${file}`);
    }
  }
  releases.push(release);
}
await writeFile(
  join(root, "catalog.json"),
  JSON.stringify(releases, null, 2) + "\n",
);
console.log(
  `${upload ? "Uploaded" : "Staged"} ${releases.length} models. Catalog: ${root}/catalog.json`,
);
