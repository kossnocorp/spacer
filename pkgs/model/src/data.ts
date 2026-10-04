import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { finished } from "node:stream/promises";

export type Split = "train" | "eval" | "test";
export type Example = {
  id: string;
  file: string;
  group: string;
  boundary: number;
  before: string;
  after: string;
  label: 0 | 1;
  originalLabel: 0 | 1;
};
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function splitFor(
  group: string,
  seed: string,
  evalPercent = 15,
  testPercent = 15,
): Split {
  const bucket =
    (parseInt(hash(`${seed}:${group}`).slice(0, 8), 16) / 0x1_0000_0000) * 100;
  return bucket < testPercent
    ? "test"
    : bucket < testPercent + evalPercent
      ? "eval"
      : "train";
}
export function spacingAt(lines: string[], text: string): Set<number> {
  const raw = text.replaceAll("\r\n", "\n").split("\n");
  if (raw.at(-1) === "") raw.pop();
  let index = 0,
    blank = false;
  const gaps = new Set<number>();
  for (const line of raw) {
    if (index < lines.length && line === lines[index]) {
      if (blank && index > 0) gaps.add(index);
      index++;
      blank = false;
    } else if (!line.trim()) blank = true;
    else throw new Error(`Non-spacing change at retained line ${index + 1}`);
  }
  if (index !== lines.length)
    throw new Error("After-state is missing code or protected text");
  return gaps;
}
export function windows(lines: string[], boundary: number, context: number) {
  return {
    before: lines.slice(Math.max(0, boundary - context), boundary).join("\n"),
    after: lines.slice(boundary, boundary + context).join("\n"),
  };
}
export async function* jsonLines<T>(path: string): AsyncGenerator<T> {
  for await (const line of createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  }))
    if (line.trim()) yield JSON.parse(line) as T;
}
export function jsonWriter(path: string) {
  const stream = createWriteStream(path, { flags: "wx" });
  const done = finished(stream);
  // Attach immediately so a failed writer cannot produce an unhandled rejection.
  void done.catch(() => {});
  return {
    async write(value: unknown) {
      if (!stream.write(JSON.stringify(value) + "\n"))
        await once(stream, "drain");
    },
    async close() {
      stream.end();
      await done;
    },
  };
}
