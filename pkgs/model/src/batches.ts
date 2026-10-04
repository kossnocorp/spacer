import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LayersModel, Tensor } from "@tensorflow/tfjs-node";
import { tf } from "./runtime.ts";

export type EncodedData = {
  bytes: Buffer;
  count: number;
  length: number;
  recordBytes: number;
};
export async function loadData(
  root: string,
  split: string,
): Promise<EncodedData> {
  const manifest = JSON.parse(
    await readFile(join(root, "manifest.json"), "utf8"),
  );
  const bytes = await readFile(join(root, `${split}.bin`));
  const count = manifest.splits[split].count;
  if (bytes.length !== count * manifest.recordBytes)
    throw new Error(`Invalid encoded ${split} file size`);
  return {
    bytes,
    count,
    length: manifest.tokensPerSide,
    recordBytes: manifest.recordBytes,
  };
}
export function batch(
  data: EncodedData,
  indices: ArrayLike<number>,
  start: number,
  size: number,
) {
  const count = Math.min(size, indices.length - start),
    length = data.length;
  const before = new Int32Array(count * length),
    after = new Int32Array(count * length);
  const labels = new Float32Array(count),
    originals = new Uint8Array(count);
  for (let j = 0; j < count; j++) {
    const offset = indices[start + j] * data.recordBytes;
    for (let i = 0; i < length; i++) {
      before[j * length + i] = data.bytes.readUInt32LE(offset + i * 4);
      after[j * length + i] = data.bytes.readUInt32LE(
        offset + (length + i) * 4,
      );
    }
    labels[j] = data.bytes.readUInt32LE(offset + length * 8);
    originals[j] = data.bytes.readUInt32LE(offset + length * 8 + 4);
  }
  const inputs = [
    tf.tensor2d(before, [count, length], "int32"),
    tf.tensor2d(after, [count, length], "int32"),
  ];
  const targets = tf.tensor2d(labels, [count, 1]);
  return {
    inputs,
    targets,
    labels,
    originals,
    dispose() {
      tf.dispose([...inputs, targets]);
    },
  };
}
export function shuffle(indices: Uint32Array, seed: number) {
  let state = seed >>> 0;
  for (let i = indices.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
}
export async function predictData(
  model: LayersModel,
  data: EncodedData,
  batchSize: number,
) {
  const indices = Uint32Array.from({ length: data.count }, (_, i) => i);
  const labels = new Uint8Array(data.count),
    originals = new Uint8Array(data.count),
    scores = new Float32Array(data.count);
  for (let start = 0; start < data.count; start += batchSize) {
    const tensors = batch(data, indices, start, batchSize);
    const output = model.predict(tensors.inputs) as Tensor;
    scores.set(await output.data(), start);
    labels.set(tensors.labels, start);
    originals.set(tensors.originals, start);
    output.dispose();
    tensors.dispose();
  }
  return { labels, originals, scores };
}
