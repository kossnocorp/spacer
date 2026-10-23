import type { Document } from "@spcr/tree-sitter";
import type { Prepared } from "@spcr/playground";

// Keep the Lines model's text/BPE input; Tree-sitter only supplies safe gaps
// and syntax-preserving rendering for languages oxfmt cannot prepare.
export function lineContext(document: Document): Prepared {
  const rows: number[] = [];
  const lines: string[] = [];
  for (const line of document.lines) {
    rows.push(lines.length);
    if (document.preserveBlankLines || line.trim()) lines.push(line);
  }
  return {
    file: document.language,
    original: document.source,
    normalized: document.source,
    lines,
    boundaries: document.boundaries.map(boundary => rows[boundary.row]!),
    existing: document.boundaries.filter(b => b.existing).map(b => rows[b.row]!),
    probabilities: {},
  };
}
