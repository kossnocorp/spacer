import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Tensor } from "@tensorflow/tfjs-node";
import { tf } from "./runtime.ts";
import { encodeContext, type Document } from "@spcr/tree-sitter";
import { lineContext } from "./line-document.ts";
import { windows } from "./data.ts";
import { encodePair } from "./tokenizer.ts";

export const attentionTokenizerInfo = {
  name: "spacer-lexical-tree-sitter",
  schema: 1,
  lexical: {
    name: "cl100k_base",
    implementation: "gpt-tokenizer@3.4.0",
    tokensPerSide: 128,
    contextLines: 5,
  },
  structural: { name: "spacer-tree-sitter", schema: 2, tokensPerSide: 64 },
};

// Exact inference implementation of research_v2.CrossAttention (dropout disabled).
export class AttentionSpacer {
  readonly weights: Record<string, Tensor>;
  readonly threshold: number;
  constructor(weights: Record<string, Tensor>, threshold: number) {
    this.weights = weights;
    this.threshold = threshold;
  }

  static async load(directory: string) {
    const config = JSON.parse(
      await readFile(join(directory, "config.json"), "utf8"),
    );
    if (
      config.inferenceSchema !== "spacer-cross-attention-1" ||
      config.context !== 5 ||
      config.lexicalTokensPerSide !== 128 ||
      config.structuralTokensPerSide !== 64
    )
      throw new Error("Incompatible cross-attention inference configuration");
    if (
      JSON.stringify(config.tokenizer) !==
      JSON.stringify(attentionTokenizerInfo)
    )
      throw new Error("Incompatible cross-attention tokenizer");
    const specs: { name: string; shape: number[] }[] = JSON.parse(
      await readFile(join(directory, "best/model.json"), "utf8"),
    );
    const bytes = await readFile(join(directory, "best/weights.bin"));
    const weights: Record<string, Tensor> = {};
    let offset = 0;
    try {
      for (const spec of specs) {
        const count = spec.shape.reduce((a, b) => a * b, 1);
        const values = new Float32Array(count);
        for (let i = 0; i < count; i++)
          values[i] = bytes.readFloatLE(offset + i * 4);
        weights[spec.name] = tf.tensor(values, spec.shape);
        offset += count * 4;
      }
      if (offset !== bytes.length)
        throw new Error("Cross-attention weight length mismatch");
      return new AttentionSpacer(weights, config.threshold);
    } catch (error) {
      tf.dispose(Object.values(weights));
      throw error;
    }
  }

  async scoreTokens(tokens: Int32Array, count: number) {
    if (!count) return new Float32Array();
    if (tokens.length !== count * 384)
      throw new Error("Expected 384 tokens per boundary");
    const output = tf.tidy(() => {
      const w = this.weights;
      const linear = (x: Tensor, weight: Tensor, bias: Tensor) =>
        x
          .reshape([-1, x.shape.at(-1)!])
          .matMul(weight, false, true)
          .add(bias)
          .reshape([...x.shape.slice(0, -1), weight.shape[0]!]);
      const dense = (x: Tensor, name: string) =>
        linear(x, w[`${name}.weight`]!, w[`${name}.bias`]!);
      const x = tf.tensor2d(tokens, [count, 384], "int32");
      const lexical = tf.gather(
        w["lexical.weight"]!,
        x.slice([0, 0], [count, 256]),
      );
      const structural = tf.gather(
        w["structural.weight"]!,
        x.slice([0, 256], [count, 128]),
      );
      const memory = dense(tf.concat([lexical, structural], 1), "project").add(
        w.positions!,
      );
      const queries = w.queries!.tile([count, 1, 1]);
      const project = (input: Tensor, index: number) =>
        linear(
          input,
          w["attention.in_proj_weight"]!.slice([index * 64, 0], [64, 64]),
          w["attention.in_proj_bias"]!.slice([index * 64], [64]),
        );
      const q = project(queries, 0)
        .reshape([count, 8, 4, 16])
        .transpose([0, 2, 1, 3]);
      const k = project(memory, 1)
        .reshape([count, 384, 4, 16])
        .transpose([0, 2, 1, 3]);
      const v = project(memory, 2)
        .reshape([count, 384, 4, 16])
        .transpose([0, 2, 1, 3]);
      const mask = x.equal(0).toFloat().mul(-1e9).reshape([count, 1, 1, 384]);
      const probabilities = tf.softmax(
        tf.matMul(q, k, false, true).mul(0.25).add(mask),
        -1,
      );
      const attended = tf
        .matMul(probabilities, v)
        .transpose([0, 2, 1, 3])
        .reshape([count, 8, 64]);
      const residual = queries.add(dense(attended, "attention.out_proj"));
      const moments = tf.moments(residual, -1, true);
      const normalized = residual
        .sub(moments.mean)
        .div(moments.variance.add(1e-5).sqrt())
        .mul(w["norm.weight"]!)
        .add(w["norm.bias"]!);
      const hidden = dense(normalized, "feedforward.0");
      const gelu = hidden.mul(0.5).mul(tf.erf(hidden.div(Math.sqrt(2))).add(1));
      const features = normalized.add(dense(gelu, "feedforward.3"));
      const near = tf.concat(
        [
          lexical.slice([0, 112, 0], [count, 32, 32]),
          structural.slice([0, 48, 0], [count, 32, 32]),
        ],
        1,
      );
      return dense(
        dense(
          tf.concat(
            [features.reshape([count, 512]), near.reshape([count, 2048])],
            1,
          ),
          "head.0",
        ).relu(),
        "head.3",
      ).sigmoid();
    });
    try {
      return new Float32Array(await output.data());
    } finally {
      output.dispose();
    }
  }

  async score(document: Document, batchSize = 128) {
    const prepared = lineContext(document);
    const scores = new Float32Array(document.boundaries.length);
    for (let start = 0; start < scores.length; start += batchSize) {
      const count = Math.min(batchSize, scores.length - start);
      const tokens = new Int32Array(count * 384);
      for (let i = 0; i < count; i++) {
        const index = start + i;
        const context = windows(prepared.lines, prepared.boundaries[index]!, 5);
        tokens.set(
          encodePair(context.before, context.after, 128).values,
          i * 384,
        );
        tokens.set(
          encodeContext(document.events, document.boundaries[index]!.row, 64),
          i * 384 + 256,
        );
      }
      scores.set(await this.scoreTokens(tokens, count), start);
    }
    return scores;
  }

  dispose() {
    tf.dispose(Object.values(this.weights));
  }
}
