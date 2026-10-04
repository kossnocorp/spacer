import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prepare, render, Spacer } from "../src/formatter.ts";
import type { LocalSpacer } from "../../model/src/predict.ts";

let local: Promise<LocalSpacer> | undefined;
function loadLocal() {
  // Load through Node, outside Vite's module runner: TensorFlow uses native bindings.
  const entry = pathToFileURL(resolve("../model/src/predict.ts")).href;
  local ??= import(/* @vite-ignore */ entry)
    .then((module) =>
      module.LocalSpacer.load(
        resolve(process.env.SPACER_MODEL_DIR ?? "../../tmp/model-rocm"),
      ),
    )
    .catch((error) => {
      local = undefined;
      throw error;
    });
  return local;
}

export async function formatSource(
  source: string,
  filename: string,
  backend: "spacer" | "jev",
) {
  const started = performance.now();
  const file = await prepare(filename, source);
  let threshold: number;
  if (backend === "spacer") {
    const model = await loadLocal();
    await model.score([file]);
    threshold = model.threshold * 100;
  } else {
    if (!process.env.TYPESAFE_API_KEY)
      throw new Error("Set TYPESAFE_API_KEY on the server to use Jev.");
    const jev = new Spacer();
    await jev.score([file]);
    threshold = jev.config.threshold;
  }
  return {
    output: render(file, threshold),
    backend,
    elapsedMs: performance.now() - started,
    boundaries: file.boundaries.length,
  };
}
