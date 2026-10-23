// Five nonempty lines per side, preserving internal blank runs but never the
// target gap [from, to). Shared by training and autoregressive inference.
import { encodeContext, type Document } from "@spcr/tree-sitter";
import { encodePair } from "./tokenizer.ts";

export function spacingContext(
  lines: string[],
  from: number,
  to: number,
  count = 5,
) {
  let start = from,
    end = to,
    seen = 0;
  while (start > 0 && seen < count) {
    start--;
    if (lines[start]!.trim()) seen++;
  }
  seen = 0;
  while (end < lines.length && seen < count) {
    if (lines[end]!.trim()) seen++;
    end++;
  }
  return {
    before: lines.slice(start, from).join("\n"),
    after: lines.slice(to, end).join("\n"),
  };
}

export async function scoreSequential(
  document: Document,
  threshold: number,
  predict: (tokens: Int32Array) => Promise<number>,
) {
  const lines = [...document.lines];
  const scores = new Float32Array(document.boundaries.length);
  let offset = 0;
  for (let i = 0; i < document.boundaries.length; i++) {
    const gap = document.boundaries[i]!;
    const from = gap.from + offset,
      to = gap.to + offset;
    const context = spacingContext(lines, from, to);
    const tokens = new Int32Array(384);
    tokens.set(encodePair(context.before, context.after, 128).values);
    // Syntax events refer to the original source. Blank-line edits do not
    // change their token order, and row numbers are not model features.
    tokens.set(encodeContext(document.events, gap.row, 64), 256);
    const probability = await predict(tokens);
    if (!Number.isFinite(probability) || probability < 0 || probability > 1)
      throw new Error("Invalid sequential prediction");
    scores[i] = probability;
    const inserted = scores[i]! >= threshold ? [""] : [];
    lines.splice(from, to - from, ...inserted);
    offset += inserted.length - (to - from);
  }
  return scores;
}
