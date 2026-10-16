import { tf } from "./runtime.ts";
import type { SymbolicTensor } from "@tensorflow/tfjs-node";
import { tokenizerInfo } from "./tokenizer.ts";

export function buildModel(length: number, seed = 42, vocabulary = tokenizerInfo.vocabulary) {
  const left = tf.input({ name: "before", shape: [length], dtype: "int32" });
  const right = tf.input({ name: "after", shape: [length], dtype: "int32" });
  const embedding = tf.layers.embedding({
    name: "bpe_embedding",
    inputDim: vocabulary,
    outputDim: 24,
    embeddingsInitializer: tf.initializers.randomUniform({
      minval: -0.05,
      maxval: 0.05,
      seed,
    }),
  });
  const convolution = tf.layers.conv1d({
    name: "shared_patterns",
    filters: 32,
    kernelSize: 3,
    padding: "same",
    activation: "relu",
    kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 1 }),
  });
  const encode = (input: SymbolicTensor, side: "left" | "right") => {
    const tokens = embedding.apply(input) as SymbolicTensor;
    const patterns = convolution.apply(tokens) as SymbolicTensor;
    const max = tf.layers
      .globalMaxPooling1d({})
      .apply(patterns) as SymbolicTensor;
    const average = tf.layers
      .globalAveragePooling1d({})
      .apply(patterns) as SymbolicTensor;
    const grid = tf.layers
      .reshape({ targetShape: [length, 24, 1] })
      .apply(tokens) as SymbolicTensor;
    const nearest = tf.layers
      .cropping2D({
        cropping: [
          side === "left" ? [length - 16, 0] : [0, length - 16],
          [0, 0],
        ],
      })
      .apply(grid) as SymbolicTensor;
    return [max, average, tf.layers.flatten().apply(nearest) as SymbolicTensor];
  };
  const features = tf.layers
    .concatenate()
    .apply([
      ...encode(left, "left"),
      ...encode(right, "right"),
    ]) as SymbolicTensor;
  const dense = tf.layers
    .dense({
      units: 64,
      activation: "relu",
      kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 2 }),
    })
    .apply(features) as SymbolicTensor;
  const dropout = tf.layers
    .dropout({ rate: 0.15, seed: seed + 3 })
    .apply(dense) as SymbolicTensor;
  const prediction = tf.layers
    .dense({
      name: "blank_line_probability",
      units: 1,
      activation: "sigmoid",
      kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 4 }),
    })
    .apply(dropout) as SymbolicTensor;
  const model = tf.model({
    inputs: [left, right],
    outputs: prediction,
    name: "spacer_boundary_cnn",
  });
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "binaryCrossentropy",
  });
  return model;
}
