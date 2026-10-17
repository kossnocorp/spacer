import { resolve } from "node:path";
import { LocalSpacer } from "./predict.ts";
import { TreeSpacer } from "./tree-predict.ts";
import { prepareDocument, renderDocument } from "@spcr/tree-sitter";
import { models } from "./catalog.ts";

const cache = new Map<string, Promise<LocalSpacer | TreeSpacer>>();
export async function formatModel(
  source: string,
  filename: string,
  id: string,
) {
  const entry = models.find((m) => m.id === id);
  if (!entry) throw new Error("Unknown model ID");
  const started = performance.now();
  let pending = cache.get(id);
  if (!pending) {
    const directory = resolve("../..", entry.directory);
    pending =
      entry.family === "lines"
        ? LocalSpacer.load(directory)
        : TreeSpacer.load(directory);
    cache.set(id, pending);
    pending.catch(() => cache.delete(id));
  }
  const model = await pending;
  const doc = await prepareDocument(source, filename);
  const scores = model instanceof TreeSpacer
    ? await model.score(doc)
    : await model.scoreDocument(doc);
  const output = await renderDocument(doc, scores, model.threshold);
  const boundaries = doc.boundaries.length;
  return {
    output,
    boundaries,
    backend: id,
    elapsedMs: performance.now() - started,
  };
}
