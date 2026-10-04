import { encode } from "gpt-tokenizer/encoding/cl100k_base";

export const tokenizerInfo = {
  name: "cl100k_base",
  implementation: "gpt-tokenizer@3.4.0",
  mode: "line-wise BPE; literal special-token strings are ordinary text",
  pad: 0,
  offset: 1,
  vocabulary: 100278,
};
const cache = new Map<string, number[]>();
export function tokenize(text: string): number[] {
  const result: number[] = [];
  for (const line of text.split("\n")) {
    let tokens = cache.get(line);
    if (!tokens) {
      tokens = encode(line + "\n", { disallowedSpecial: new Set() }).map(
        (id) => id + 1,
      );
      if (cache.size >= 50_000) cache.delete(cache.keys().next().value!);
      cache.set(line, tokens);
    }
    result.push(...tokens);
  }
  return result;
}
export function encodePair(before: string, after: string, length: number) {
  const left = tokenize(before),
    right = tokenize(after);
  const values = new Int32Array(length * 2);
  const beforeTokens = left.slice(-length),
    afterTokens = right.slice(0, length);
  // Nearest code sits at the end of before and the start of after.
  values.set(beforeTokens, length - beforeTokens.length);
  values.set(afterTokens, length);
  return {
    values,
    beforeTruncated: left.length > length,
    afterTruncated: right.length > length,
  };
}
