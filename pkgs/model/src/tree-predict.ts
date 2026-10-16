import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { LayersModel, Tensor } from "@tensorflow/tfjs-node";
import { tf } from "./runtime.ts";
import {
  tokenizerInfo,
  encodeContext,
  prepareDocument,
  renderDocument,
  type Document,
} from "@spcr/tree-sitter";

export class TreeSpacer {
  readonly model: LayersModel;
  readonly tokensPerSide: number;
  readonly threshold: number;
  constructor(model: LayersModel, tokensPerSide: number, threshold: number) {
    this.model = model;
    this.tokensPerSide = tokensPerSide;
    this.threshold = threshold;
  }
  static async load(directory: string) {
    const config = JSON.parse(
      await readFile(join(directory, "config.json"), "utf8"),
    );
    if (JSON.stringify(config.tokenizer) !== JSON.stringify(tokenizerInfo))
      throw new Error(
        "Incompatible tree-sitter tokenizer; retrain or use matching package version",
      );
    return new TreeSpacer(
      await tf.loadLayersModel(
        pathToFileURL(join(directory, "best/model.json")).href,
      ),
      config.tokensPerSide,
      config.threshold,
    );
  }
  async score(document: Document, batchSize = 512) {
    const scores = new Float32Array(document.boundaries.length),
      n = this.tokensPerSide;
    for (let start = 0; start < scores.length; start += batchSize) {
      const boundaries = document.boundaries.slice(start, start + batchSize);
      const left = new Int32Array(boundaries.length * n),
        right = new Int32Array(left.length);
      boundaries.forEach((b, i) => {
        const tokens = encodeContext(document.events, b.row, n);
        left.set(tokens.subarray(0, n), i * n);
        right.set(tokens.subarray(n), i * n);
      });
      const inputs = [
        tf.tensor2d(left, [boundaries.length, n], "int32"),
        tf.tensor2d(right, [boundaries.length, n], "int32"),
      ];
      let output: Tensor | undefined;
      try {
        output = this.model.predict(inputs) as Tensor;
        scores.set(await output.data(), start);
      } finally {
        tf.dispose(inputs);
        output?.dispose();
      }
    }
    return scores;
  }
  async format(source: string, filename: string) {
    const doc = await prepareDocument(source, filename);
    return renderDocument(doc, await this.score(doc), this.threshold);
  }
  dispose() {
    this.model.dispose();
  }
}
