import { defineHandler } from "void";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const POST = defineHandler(async c => {
  try {
    const body = await c.req.json();
    if (typeof body?.source !== "string" || body.source.length > 20000 ||
      typeof body.filename !== "string" || !/^[\w.-]+$/.test(body.filename))
      return c.json({ error: "Provide a filename and source up to 20,000 characters." }, 400);
    // Keep Tree-sitter workers outside Vite's module runner.
    const entry = pathToFileURL(resolve("../model/src/inspect-tokenizers.ts")).href;
    const { inspectTokenizers } = await import(/* @vite-ignore */ entry);
    return await inspectTokenizers(body.source, body.filename, body.boundary, body.length);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Tokenization failed" }, 422);
  }
});
