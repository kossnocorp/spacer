import { defineHandler } from "void";
import { formatSource } from "../../server/format.ts";
import { models } from "../../../model/src/catalog.ts";

export const POST = defineHandler(async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Expected a JSON request." }, 400);
  }
  if (!body || typeof body !== "object")
    return c.json({ error: "Expected source, filename and backend." }, 400);
  const { source, filename, backend, apiKey } = body as Record<string, unknown>;
  if (
    typeof source !== "string" ||
    source.length > 200000 ||
    (apiKey !== undefined && (typeof apiKey !== "string" || apiKey.length > 4096)) ||
    typeof filename !== "string" ||
    !/^[\w.-]+$/.test(filename) ||
    (backend !== "spacer" &&
      backend !== "jev" &&
      !models.some((m) => m.id === backend))
  ) {
    return c.json(
      {
        error:
          "Provide source text up to 200,000 characters, a filename, and a listed model ID or jev.",
      },
      400,
    );
  }
  try {
    return await formatSource(source, filename, backend as string, backend === "jev" ? apiKey as string | undefined : undefined);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Formatting failed.";
    return c.json({ error: message }, 422);
  }
});
