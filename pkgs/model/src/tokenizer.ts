import { encode, decode } from "gpt-tokenizer/encoding/cl100k_base";

export const tokenizerInfo = {
  name: "cl100k_base",
  implementation: "gpt-tokenizer@3.4.0",
  mode: "line-wise BPE; literal special-token strings are ordinary text",
  pad: 0,
  offset: 1,
  vocabulary: 100278,
};
const cache = new Map<string, number[]>();
// Debugging view uses the exact same line-wise tokenization, including the
// synthetic final newline. Byte fragments of a Unicode character share its span.
export function inspectText(text: string, offset = 0) {
  const tokens: { id: number; label: string; start: number; end: number }[] =
    [];
  let lineOffset = 0;
  for (const line of text.split("\n")) {
    const ids = encode(line + "\n", { disallowedSpecial: new Set() });
    let previous = "";
    for (let i = 0; i < ids.length; i++) {
      const prefix = decode(ids.slice(0, i + 1));
      const start = previous.replace(/\uFFFD+$/, "").length;
      const validEnd = prefix.replace(/\uFFFD+$/, "").length;
      const end = prefix.endsWith("\uFFFD")
        ? validEnd +
          String.fromCodePoint((line + "\n").codePointAt(validEnd) ?? 10).length
        : validEnd;
      tokens.push({
        id: ids[i]! + 1,
        label: decode([ids[i]!]),
        start: offset + Math.min(text.length, lineOffset + start),
        end: offset + Math.min(text.length, lineOffset + end),
      });
      previous = prefix;
    }
    lineOffset += line.length + 1;
  }
  return tokens;
}
export function tokenize(text: string): number[] {
  const result: number[] = [];
  for (const line of text.split("\n")) {
    let tokens = cache.get(line);
    if (!tokens) {
      tokens = encode(line + "\n", { disallowedSpecial: new Set() }).map(
        (id) => id + 1,
      );
      // Generated/minified upstream files can contain enormous single lines.
      // Keep their encodings out of the line cache, without changing the tokens.
      if (tokens.length <= 4096) {
        if (cache.size >= 50_000) cache.delete(cache.keys().next().value!);
        cache.set(line, tokens);
      }
    }
    for (const token of tokens) result.push(token);
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
