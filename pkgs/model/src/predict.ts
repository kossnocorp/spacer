import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { LayersModel, Tensor } from "@tensorflow/tfjs-node";
import { prepare, render, type Prepared } from "@spcr/playground";
import { tf } from "./runtime.ts";
import { encodePair, tokenizerInfo } from "./tokenizer.ts";
import { windows } from "./data.ts";
import { prepareDocument, renderDocument, type Document } from "@spcr/tree-sitter";
import { lineContext } from "./line-document.ts";

export class LocalSpacer {
  model: LayersModel;
  context: number;
  tokensPerSide: number;
  threshold: number;
  constructor(
    model: LayersModel,
    config: { context: number; tokensPerSide: number; threshold: number },
  ) {
    this.model = model;
    this.context = config.context;
    this.tokensPerSide = config.tokensPerSide;
    this.threshold = config.threshold;
  }
  static async load(directory: string) {
    const config = JSON.parse(
      await readFile(join(directory, "config.json"), "utf8"),
    );
    if (JSON.stringify(config.tokenizer) !== JSON.stringify(tokenizerInfo))
      throw new Error("Model tokenizer is incompatible with this runtime");
    const model = await tf.loadLayersModel(
      pathToFileURL(join(directory, "best/model.json")).href,
    );
    return new LocalSpacer(model, config);
  }
  async score(files: Prepared[], batchSize = 512) {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1)
      throw new Error("batch size must be positive");
    const tasks = files.flatMap((file) =>
      file.boundaries.map((boundary) => ({ file, boundary })),
    );
    const length = this.tokensPerSide;
    for (let start = 0; start < tasks.length; start += batchSize) {
      const batch = tasks.slice(start, start + batchSize);
      const left = new Int32Array(batch.length * length),
        right = new Int32Array(batch.length * length);
      batch.forEach(({ file, boundary }, index) => {
        const { before, after } = windows(file.lines, boundary, this.context);
        const { values } = encodePair(before, after, length);
        left.set(values.subarray(0, length), index * length);
        right.set(values.subarray(length), index * length);
      });
      const inputs = [
        tf.tensor2d(left, [batch.length, length], "int32"),
        tf.tensor2d(right, [batch.length, length], "int32"),
      ];
      let output: Tensor | undefined;
      try {
        output = this.model.predict(inputs) as Tensor;
        const scores = await output.data();
        batch.forEach(({ file, boundary }, index) => {
          file.probabilities[boundary] = scores[index];
        });
      } finally {
        tf.dispose(inputs);
        output?.dispose();
      }
    }
  }
  dispose() {
    this.model.dispose();
  }
  async scoreDocument(document: Document) {
    const file = lineContext(document);
    await this.score([file]);
    return file.boundaries.map(row => file.probabilities[row]!);
  }
  async formatSource(source: string, filename: string) {
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(filename)) {
      const document = await prepareDocument(source, filename);
      return renderDocument(document, await this.scoreDocument(document), this.threshold);
    }
    const file = await prepare(filename, source);
    await this.score([file]);
    return render(file, this.threshold * 100);
  }
}
