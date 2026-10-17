import { tf } from "./runtime.ts";
import type { SymbolicTensor } from "@tensorflow/tfjs-node";
import { tokenizerInfo } from "./tokenizer.ts";

export interface Architecture {
  embedding: number;
  channels: number;
  hidden: number;
  dilations: number[];
  nearest: number;
  contextualNearest: number;
  dropout: number;
}
export function buildModel(
  length: number,
  seed = 42,
  vocabulary = tokenizerInfo.vocabulary,
  architecture?: Architecture,
) {
  const a = architecture ?? {
    embedding: 24,
    channels: 32,
    hidden: 64,
    dilations: [1],
    nearest: 16,
    contextualNearest: 0,
    dropout: 0.15,
  };
  const prefix = architecture ? `seed${seed}_` : "";
  const left = tf.input({ name: "before", shape: [length], dtype: "int32" });
  const right = tf.input({ name: "after", shape: [length], dtype: "int32" });
  const embedding = tf.layers.embedding({
    name: `${prefix}bpe_embedding`,
    inputDim: vocabulary,
    outputDim: a.embedding,
    embeddingsInitializer: tf.initializers.randomUniform({
      minval: -0.05,
      maxval: 0.05,
      seed,
    }),
  });
  const convolutions = a.dilations.map((dilation, index) =>
    tf.layers.conv1d({
      name: `${prefix}${index === 0 ? "shared_patterns" : `shared_patterns_${index}`}`,
      filters: a.channels,
      kernelSize: 3,
      dilationRate: dilation,
      padding: "same",
      activation: "relu",
      kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 1 }),
    }),
  );
  const nearestFeatures = (
    tokens: SymbolicTensor,
    side: "left" | "right",
    width: number,
    count: number,
  ) => {
    const grid = tf.layers
      .reshape({ targetShape: [length, width, 1] })
      .apply(tokens) as SymbolicTensor;
    const nearest = tf.layers
      .cropping2D({
        cropping: [
          side === "left" ? [length - count, 0] : [0, length - count],
          [0, 0],
        ],
      })
      .apply(grid) as SymbolicTensor;
    return tf.layers.flatten().apply(nearest) as SymbolicTensor;
  };
  const encode = (input: SymbolicTensor, side: "left" | "right") => {
    const tokens = embedding.apply(input) as SymbolicTensor;
    let patterns = tokens;
    for (const convolution of convolutions)
      patterns = convolution.apply(patterns) as SymbolicTensor;
    const max = tf.layers
      .globalMaxPooling1d({})
      .apply(patterns) as SymbolicTensor;
    const average = tf.layers
      .globalAveragePooling1d({})
      .apply(patterns) as SymbolicTensor;
    const features = [
      max,
      average,
      nearestFeatures(tokens, side, a.embedding, a.nearest),
    ];
    if (a.contextualNearest)
      features.push(
        nearestFeatures(patterns, side, a.channels, a.contextualNearest),
      );
    return features;
  };
  const features = tf.layers
    .concatenate()
    .apply([
      ...encode(left, "left"),
      ...encode(right, "right"),
    ]) as SymbolicTensor;
  const dense = tf.layers
    .dense({
      units: a.hidden,
      name: architecture ? `${prefix}hidden` : undefined,
      activation: "relu",
      kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 2 }),
    })
    .apply(features) as SymbolicTensor;
  const dropout = tf.layers
    .dropout({ rate: a.dropout, seed: seed + 3 })
    .apply(dense) as SymbolicTensor;
  const prediction = tf.layers
    .dense({
      name: `${prefix}blank_line_probability`,
      units: 1,
      activation: "sigmoid",
      kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 4 }),
    })
    .apply(dropout) as SymbolicTensor;
  const model = tf.model({
    inputs: [left, right],
    outputs: prediction,
    name: architecture ? `spacer_boundary_cnn_${seed}` : "spacer_boundary_cnn",
  });
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "binaryCrossentropy",
  });
  return model;
}
