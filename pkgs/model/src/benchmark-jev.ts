import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { parseArgs } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { encode } from "gpt-tokenizer";
import { Spacer, defaults } from "../../playground/src/formatter.ts";
import { examples } from "../../playground/src/examples/catalog.ts";
import { prepareDocument, closeParsers } from "@spcr/tree-sitter";
import { lineContext } from "./line-document.ts";

const { values } = parseArgs({ options: {
  execute: { type: "boolean", default: false },
  model: { type: "string", default: "jev-latest" },
  "max-estimated-tokens": { type: "string", default: "16000" },
} });
const root = "docs/benchmark-data/jev";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const atomic = async (path: string, value: unknown) => {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n");
  await rename(`${path}.tmp`, path);
};
type Request = Parameters<TypeSafeClient["systemOne"]>[0];
type Response = Awaited<ReturnType<TypeSafeClient["systemOne"]>>;
const valid = (request: Request, response: Response) => Object.keys(request.questions).every(key => {
  const answer = response.answers?.[key];
  return answer?.type === "noul" && Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1;
});
await mkdir(root, { recursive: true });
// Exclusive across planners and paid runs: never issue duplicate concurrent requests.
const lockPath = `${root}/.lock`;
const lock = await open(lockPath, "wx");
try {
  const methodology = {
    schema: 1, sampling: "16 evenly distributed admitted boundaries per language; no warmups or repeats",
    labels: "none; exploratory boundary probe, not corpus accuracy or full-file throughput",
    threshold: defaults.threshold, context: defaults.context, questionStyle: defaults.questionStyle,
    formatterSha256: hash(await readFile("pkgs/playground/src/formatter.ts", "utf8")),
  };
  const jobs = [];
  for (const language of ["typescript", "rust"]) {
    const example = examples.find(item => item.id === language)!;
    const document = await prepareDocument(example.withoutSpacing, example.filename);
    const file = lineContext(document);
    const available = file.boundaries;
    const count = Math.min(16, available.length);
    file.boundaries = Array.from({ length: count }, (_, i) => available[Math.floor(i * available.length / count)]!);
    const requests: Request[] = [];
    // Capture the exact production prompts without constructing a network client.
    const capture = { systemOne: async (request: Request) => {
      requests.push(request);
      return { model: "dry-run", usage: { input_tokens: 0, output_tokens: 0 },
        answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, { type: "noul", noul: 0 }])) };
    } } as unknown as TypeSafeClient;
    await new Spacer({ model: values.model, concurrency: 1, batchSize: 16 }, capture).score([file]);
    for (const request of requests) {
      const identity = { methodology, language, sourceSha256: hash(example.withoutSpacing), rows: file.boundaries, request };
      const key = hash(identity);
      let cached: { identity: typeof identity; response: Response; elapsedMs: number; created: string } | undefined;
      try {
        cached = JSON.parse(await readFile(`${root}/${key}.json`, "utf8"));
        if (!cached || hash(cached.identity) !== key || !valid(request, cached.response)) throw new Error(`Invalid cached response: ${key}`);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      jobs.push({ key, identity, cached, estimatedInputTokens: encode(JSON.stringify(request)).length });
    }
  }
  const missing = jobs.filter(job => !job.cached);
  const estimate = missing.reduce((sum, job) => sum + job.estimatedInputTokens + 256, 0);
  const plan = { methodology, model: values.model, files: 2, questions: jobs.reduce((sum, job) => sum + job.identity.rows.length, 0),
    cachedRequests: jobs.length - missing.length, missingRequests: missing.length,
    estimatedUncachedTokens: estimate,
    tokenEstimateMethod: "cl100k_base over serialized request + 256 output tokens/request; proxy only, not provider billing or a hard token cap",
    jobs: jobs.map(({ cached, ...job }) => ({ ...job, cached: Boolean(cached) })) };
  await atomic(`${root}/plan.json`, plan);
  console.log(JSON.stringify({ files: plan.files, questions: plan.questions, cachedRequests: plan.cachedRequests,
    missingRequests: plan.missingRequests, estimatedUncachedTokens: estimate, execute: values.execute }, null, 2));
  const budget = Number(values["max-estimated-tokens"]);
  if (!Number.isSafeInteger(budget) || budget < 0) throw new Error("Invalid estimated-token budget");
  if (values.execute && estimate > budget) throw new Error(`Estimated tokens ${estimate} exceed budget ${budget}`);
  if (values.execute && missing.length) {
    const apiKey = process.env.TYPESAFE_API_KEY;
    if (!apiKey) throw new Error("TYPESAFE_API_KEY is required for uncached calls");
    const client = new TypeSafeClient({ apiKey, timeout: 120_000, retry: { maxRetries: 0 } });
    for (const job of missing) {
      // Reserve before sending: ambiguous timeouts must never cause automatic rebilling.
      const pending = `${root}/${job.key}.pending`;
      const reservation = await open(pending, "wx");
      await reservation.close();
      const started = performance.now();
      const response = await client.systemOne(job.identity.request);
      if (!valid(job.identity.request, response)) throw new Error("Invalid Jev response; reservation retained");
      job.cached = { identity: job.identity, response, elapsedMs: performance.now() - started, created: new Date().toISOString() };
      await atomic(`${root}/${job.key}.json`, job.cached);
      await unlink(pending);
    }
  }
  await atomic(`${root}/results.json`, { methodology, complete: jobs.every(job => job.cached),
    results: jobs.map(job => ({ key: job.key, language: job.identity.language, rows: job.identity.rows,
      status: job.cached ? "cached" : "not-run", response: job.cached?.response ?? null,
      elapsedMs: job.cached?.elapsedMs ?? null, measuredAt: job.cached?.created ?? null })) });
} finally {
  await lock.close();
  await unlink(lockPath);
  await closeParsers();
}
