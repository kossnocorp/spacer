import { tokenize, languageFor, encodeContext, encodeLegacyContext,
  tokenizerInfo, legacyTokenizerInfo, entities, type InspectedToken } from "@spcr/tree-sitter";
import { inspectText, tokenizerInfo as textInfo } from "./tokenizer.ts";

export async function inspectTokenizers(source: string, filename: string, boundary: number, length: number) {
  const language = languageFor(filename);
  if (!language) throw new Error("Unsupported filename extension");
  const lines = source.split("\n");
  if (!Number.isInteger(boundary) || boundary < 0 || boundary > lines.length)
    throw new Error("Boundary must be between 0 and the number of source lines");
  if (!Number.isInteger(length) || length < 1 || length > 256)
    throw new Error("Tokens per side must be between 1 and 256");
  const events = await tokenize(source, language);
  const compact: InspectedToken[] = [];
  const compactIds = encodeContext(events, boundary, length, t => compact.push(t));
  const split = events.findIndex(e => e.row >= boundary);
  const at = split < 0 ? events.length : split;
  const left = events.slice(Math.max(0, at - length), at);
  const right = events.slice(at, at + length);
  const legacy = [...left.map((e, i) => ({ ...e, position: length - left.length + i })),
    ...right.map((e, i) => ({ ...e, position: length + i }))];
  const identities = [...new Map(compact.filter(t => t.id >= 256).map(t => [t.id, {
    id: t.id, name: t.name,
    occurrences: compact.filter(o => o.id === t.id).map(o => ({ start: o.start, end: o.end,
      side: o.position < length ? "before" : "after" })),
  }])).values()];
  const view = (ids: Int32Array, tokens: InspectedToken[], compactMode: boolean) => Array.from(ids, (id, position) => {
    const t = tokens.find(t => t.position === position);
    return { ...t, id, position, label: id < entities.length ? entities[id]!
      : compactMode ? `ID_${id - 256}` : `byte ${id - 256} (${JSON.stringify(String.fromCharCode(id - 256))})` };
  });
  // Reproduce the line model's five-line context, excluding empty lines as the
  // formatting pipeline does. The source offsets remain in the original input.
  const starts: number[] = []; let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const nonempty = lines.map((text, row) => ({ text, row })).filter(l => l.text.trim());
  const before = nonempty.filter(l => l.row < boundary).slice(-5);
  const after = nonempty.filter(l => l.row >= boundary).slice(0, 5);
  const textSide = (rows: typeof before) => rows.length ? rows.flatMap(({text, row}) => inspectText(text, starts[row])) : inspectText("", Math.min(source.length, starts[boundary] ?? source.length));
  const bl = textSide(before).slice(-length), ar = textSide(after).slice(0, length);
  const bpe = Array.from({ length: length * 2 }, (_, position) => {
    const t = position < length ? bl[position - (length - bl.length)] : ar[position - length];
    return { id: t?.id ?? 0, label: t?.label ?? "PAD", start: t?.start, end: t?.end, position };
  });
  return { source, filename, language, boundary, tokensPerSide: length, identities,
    views: [
      { key: "compact", title: "Tree-Sitter · compact IDs", metadata: tokenizerInfo, tokens: view(compactIds, compact, true) },
      { key: "bytes", title: "Tree-Sitter · identifier bytes", metadata: legacyTokenizerInfo, tokens: view(encodeLegacyContext(events, boundary, length), legacy, false) },
      { key: "bpe", title: "Text · line-wise BPE", metadata: { ...textInfo, contextLinesPerSide: 5 }, tokens: bpe },
    ],
    notes: ["Boundary is the number of lines before the gap. PAD has no source span.",
      "Structural tokens highlight their AST node; name bytes highlight the entire identifier.",
      "Compact IDs mean normalized spelling equality, not scope-resolved bindings.",
      "Text view uses five nonempty lines per side, without running oxfmt; synthetic newlines may have zero-width spans."] };
}
