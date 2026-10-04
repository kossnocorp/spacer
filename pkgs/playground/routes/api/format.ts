import { defineHandler } from "void";
import { formatSource } from "../../server/format.ts";

export const POST = defineHandler(async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Expected a JSON request." }, 400);
  }
  if (!body || typeof body !== "object")
    return c.json({ error: "Expected source, filename and backend." }, 400);
  const { source, filename, backend } = body as Record<string, unknown>;
  if (
    typeof source !== "string" ||
    typeof filename !== "string" ||
    !/^[\w.-]+\.(?:[cm]?[jt]s|[jt]sx)$/.test(filename) ||
    (backend !== "spacer" && backend !== "jev")
  ) {
    return c.json(
      {
        error:
          "Provide source text, a JS/TS filename, and the spacer or jev backend.",
      },
      400,
    );
  }
  try {
    return await formatSource(source, filename, backend);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Formatting failed.";
    return c.json({ error: message }, 422);
  }
});
