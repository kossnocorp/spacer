import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildModel } from "./network.ts";
import { tf } from "./runtime.ts";

const project = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (!["smoke", "train", "export"].includes(args[0]))
  throw new Error(
    "Usage: node pkgs/model/src/rocm.ts smoke|train|export [--data PATH --out PATH --device INDEX --epochs 5]",
  );
if (args[0] !== "export") {
  const child = spawn(
    "uv",
    [
      "run",
      "--project",
      project,
      "--frozen",
      "python",
      join(project, "python/worker.py"),
      ...args,
    ],
    { stdio: "inherit" },
  );
  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  if (code !== 0) process.exit(code);
}
if (args[0] === "train" || args[0] === "export") {
  const outIndex = args.indexOf("--out");
  const root = resolve(outIndex < 0 ? "tmp/model-rocm" : args[outIndex + 1]);
  const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
  if (config.members) {
    const members = await Promise.all(
      config.members.map((member: string) =>
        tf.loadLayersModel(
          pathToFileURL(resolve(root, member, "best/model.json")).href,
        ),
      ),
    );
    const inputs = [
      tf.input({
        shape: [config.tokensPerSide],
        dtype: "int32",
        name: "before",
      }),
      tf.input({
        shape: [config.tokensPerSide],
        dtype: "int32",
        name: "after",
      }),
    ];
    const output = tf.layers
      .average()
      .apply(
        members.map((model) => model.apply(inputs)),
      ) as import("@tensorflow/tfjs-node").SymbolicTensor;
    const model = tf.model({
      inputs,
      outputs: output,
      name: "spacer_tree_ensemble",
    });
    const parity = JSON.parse(
      await readFile(join(root, "parity.json"), "utf8"),
    );
    const n = config.tokensPerSide;
    const tensors = [
      tf.tensor2d(
        parity.tokens.map((row: number[]) => row.slice(0, n)),
        undefined,
        "int32",
      ),
      tf.tensor2d(
        parity.tokens.map((row: number[]) => row.slice(n)),
        undefined,
        "int32",
      ),
    ];
    const prediction = model.predict(
      tensors,
    ) as import("@tensorflow/tfjs-node").Tensor;
    const scores = await prediction.data();
    const error = Math.max(
      ...scores.map((score, i) => Math.abs(score - parity.scores[i])),
    );
    if (!Number.isFinite(error) || error > 1e-4)
      throw new Error(`Ensemble export mismatch ${error}`);
    await model.save(pathToFileURL(join(root, "best")).href);
    await writeFile(
      join(root, "export-check.json"),
      JSON.stringify({
        examples: scores.length,
        maxAbsoluteError: error,
        passed: true,
      }),
    );
    tf.dispose([...tensors, prediction]);
    model.dispose();
    await rm(join(root, "INCOMPLETE"), { force: true });
    console.log(`Exported ensemble; max probability difference ${error}`);
  } else {
    const specs: { name: string; shape: number[] }[] = JSON.parse(
      await readFile(join(root, "export.json"), "utf8"),
    );
    const bytes = await readFile(join(root, "export.bin"));
    const model = buildModel(
      config.tokensPerSide,
      config.seed,
      config.tokenizer.vocabulary,
      config.architecture,
    );
    let offset = 0;
    const weights = specs.map((spec) => {
      const count = spec.shape.reduce((a, b) => a * b, 1);
      const values = new Float32Array(count);
      for (let i = 0; i < count; i++)
        values[i] = bytes.readFloatLE(offset + i * 4);
      offset += count * 4;
      return tf.tensor(values, spec.shape);
    });
    if (offset !== bytes.length || model.weights.length !== specs.length)
      throw new Error("Invalid exported weights");
    // TFJS orders the shared embedding, shared convolution, hidden and output layers identically.
    model.setWeights(weights);
    tf.dispose(weights);
    const parity = JSON.parse(
      await readFile(join(root, "parity.json"), "utf8"),
    );
    const n = config.tokensPerSide;
    const left = tf.tensor2d(
      parity.tokens.map((row: number[]) => row.slice(0, n)),
      undefined,
      "int32",
    );
    const right = tf.tensor2d(
      parity.tokens.map((row: number[]) => row.slice(n)),
      undefined,
      "int32",
    );
    const prediction = model.predict([
      left,
      right,
    ]) as import("@tensorflow/tfjs-node").Tensor;
    const scores = await prediction.data();
    const maxError = Math.max(
      ...scores.map((score, i) => Math.abs(score - parity.scores[i])),
    );
    tf.dispose([left, right, prediction]);
    if (!Number.isFinite(maxError) || maxError > 1e-4)
      throw new Error(`PyTorch/TFJS prediction mismatch: ${maxError}`);
    await model.save(pathToFileURL(join(root, "best")).href);
    model.dispose();
    await writeFile(
      join(root, "export-check.json"),
      JSON.stringify(
        { examples: scores.length, maxAbsoluteError: maxError, passed: true },
        null,
        2,
      ),
    );
    await rm(join(root, "INCOMPLETE"), { force: true });
    console.log(
      `Exported ROCm-trained model for TypeScript inference; max probability difference ${maxError}`,
    );
  }
}
