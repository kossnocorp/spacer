import { TypeSafeClient } from "@typesafe-ai/sdk";
import { Spacer } from "../src/formatter.ts";
import { prepareDocument, renderDocument } from "../../tree-sitter/src/index.ts";
import { lineContext } from "../../model/src/line-document.ts";

export async function formatJev(source: string, filename: string, apiKey?: string) {
  const key = apiKey?.trim() || process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("Enter a Jev API key in the playground or supply TYPESAFE_API_KEY through fnox.");
  const started = performance.now();
  const document = await prepareDocument(source, filename);
  const file = lineContext(document);
  file.file = filename;
  const jev = new Spacer({}, new TypeSafeClient({
    apiKey: key,
    timeout: 120_000,
    retry: { maxRetries: 4 },
  }));
  await jev.score([file]);
  const output = await renderDocument(document,
    file.boundaries.map(row => file.probabilities[row]!), jev.config.threshold / 100);
  return {
    output,
    backend: "jev",
    model: [...jev.models].join(", "),
    elapsedMs: performance.now() - started,
    boundaries: document.boundaries.length,
  };
}
