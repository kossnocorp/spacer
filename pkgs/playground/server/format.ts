import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultModel } from "../../model/src/catalog.ts";

export async function formatSource(
  source: string,
  filename: string,
  backend: string,
  apiKey?: string,
  preserveBlankLines = false,
) {
  if (backend !== "jev") {
    const entry = pathToFileURL(resolve("../model/src/serve.ts")).href;
    const { formatModel } = await import(/* @vite-ignore */ entry);
    return formatModel(
      source,
      filename,
      backend === "spacer" ? defaultModel : backend,
      preserveBlankLines,
    );
  }
  // Native loading keeps Tree-sitter workers outside Vite's module runner.
  const entry = pathToFileURL(resolve("server/jev.ts")).href;
  const { formatJev } = await import(/* @vite-ignore */ entry);
  return formatJev(source, filename, apiKey);
}
