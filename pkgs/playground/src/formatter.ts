import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  rename,
  unlink,
  stat,
  mkdir,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { format, type FormatConfig } from "oxfmt";
import ts from "typescript";
import { TypeSafeClient, type NoulQuestion } from "@typesafe-ai/sdk";
import { spacingPrompt } from "./prompt.ts";

export interface Options {
  context: number;
  threshold: number;
  batchSize: number;
  concurrency: number;
  model: string;
  prompt: string;
  questionStyle: "windows" | "marked";
  cache?: string;
  oxfmt?: FormatConfig;
}
export const defaults: Options = {
  context: 5,
  threshold: 55,
  batchSize: 128,
  concurrency: 8,
  model: "jev-latest",
  prompt: spacingPrompt,
  questionStyle: "marked",
};
export function options(input: Partial<Options> = {}): Options {
  const result = { ...defaults, ...input };
  for (const key of ["context", "batchSize", "concurrency"] as const) {
    if (!Number.isSafeInteger(result[key]) || result[key] < 1)
      throw new Error(`${key} must be a positive integer`);
  }
  if (
    !Number.isFinite(result.threshold) ||
    result.threshold < 0 ||
    result.threshold > 100
  )
    throw new Error("threshold must be between 0 and 100 percent");
  return result;
}

export async function parallel<T>(
  items: T[],
  concurrency: number,
  action: (item: T, index: number) => Promise<void>,
) {
  let next = 0;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length && failure === undefined) {
        const index = next++;
        try {
          await action(items[index], index);
        } catch (error) {
          failure ??= error;
        }
      }
    }),
  );
  if (failure !== undefined) throw failure;
}

function protectedBreaks(code: string, file: string): Set<number> {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const protectedLines = new Set<number>();
  const protect = (start: number, end: number) => {
    for (
      let p = code.indexOf("\n", start);
      p >= 0 && p < end;
      p = code.indexOf("\n", p + 1)
    ) {
      protectedLines.add(source.getLineAndCharacterOfPosition(p).line);
    }
  };
  const visit = (node: ts.Node) => {
    // Literal text, JSX and multiline comments must retain their exact whitespace.
    if (
      ts.isTemplateExpression(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isStringLiteral(node) ||
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      protect(node.getStart(source), node.end);
    }
    for (const range of ts.getLeadingCommentRanges(code, node.pos) ?? [])
      protect(range.pos, range.end);
    for (const range of ts.getTrailingCommentRanges(code, node.end) ?? [])
      protect(range.pos, range.end);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return protectedLines;
}

function logicalStarts(code: string, file: string): Set<number> {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const starts = new Set<number>();
  const line = (position: number) =>
    source.getLineAndCharacterOfPosition(position).line;
  const addList = (nodes: readonly ts.Node[], topLevel = false) => {
    nodes.forEach((node, index) => {
      const comments = ts.getLeadingCommentRanges(code, node.pos) ?? [];
      const start = comments[0]?.pos ?? node.getStart(source);
      if (index > 0 && line(nodes[index - 1].end) < line(start))
        starts.add(line(start));
      // Separate a file header from the first declaration, but not JSDoc from its target.
      if (topLevel && index === 0 && comments.length) {
        const header = comments.findIndex((comment) =>
          /copyright|license|SPDX/i.test(code.slice(comment.pos, comment.end)),
        );
        if (header >= 0)
          starts.add(line(comments[header + 1]?.pos ?? node.getStart(source)));
        else if (ts.isImportDeclaration(node))
          starts.add(line(node.getStart(source)));
      }
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isSourceFile(node)) addList(node.statements, true);
    else if (
      ts.isBlock(node) ||
      ts.isModuleBlock(node) ||
      ts.isCaseClause(node) ||
      ts.isDefaultClause(node)
    )
      addList(node.statements);
    else if (
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeLiteralNode(node)
    )
      addList(node.members);
    else if (ts.isObjectLiteralExpression(node)) addList(node.properties);
    else if (ts.isCaseBlock(node)) addList(node.clauses);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return starts;
}

export interface Prepared {
  file: string;
  original: string;
  normalized: string;
  lines: string[];
  boundaries: number[];
  existing: number[];
  probabilities: Record<number, number>;
}
export async function prepare(
  file: string,
  original: string,
  config?: FormatConfig,
  boundaryMode: "syntax" | "all" = "syntax",
): Promise<Prepared> {
  const result = await format(file, original, { ...config, endOfLine: "lf" });
  if (result.errors.length)
    throw new Error(
      `${file}: ${result.errors.map((e) => e.message).join("; ")}`,
    );
  return { ...prepareUnformatted(file, result.code, boundaryMode), original };
}

/** Prepare spacing decisions on the supplied text without running oxfmt. */
export function prepareUnformatted(
  file: string,
  original: string,
  boundaryMode: "syntax" | "all" = "syntax",
): Prepared {
  const normalized = original;
  const protectedLines = protectedBreaks(normalized, file);
  const starts =
    boundaryMode === "syntax" ? logicalStarts(normalized, file) : undefined;
  const raw = normalized.split("\n");
  if (raw.at(-1) === "") raw.pop();
  const lines: string[] = [],
    positions: number[] = [],
    existing: number[] = [];
  let removed = false;
  for (let i = 0; i < raw.length; i++) {
    if (
      !raw[i].trim() &&
      !protectedLines.has(i) &&
      !protectedLines.has(i - 1)
    ) {
      removed = true;
      continue;
    }
    if (removed && lines.length) existing.push(lines.length);
    removed = false;
    positions.push(i);
    lines.push(raw[i]);
  }
  const boundaries = lines.flatMap((_, i) =>
    i > 0 &&
    !protectedLines.has(positions[i - 1]) &&
    (!starts || starts.has(positions[i]))
      ? [i]
      : [],
  );
  return {
    file,
    original,
    normalized,
    lines,
    boundaries,
    existing,
    probabilities: {},
  };
}

export class Spacer {
  readonly config: Options;
  readonly client: TypeSafeClient;
  requests = 0;
  questions = 0;
  inputTokens = 0;
  outputTokens = 0;
  models = new Set<string>();
  constructor(input: Partial<Options> = {}, client?: TypeSafeClient) {
    this.config = options(input);
    this.client =
      client ??
      new TypeSafeClient({ timeout: 120_000, retry: { maxRetries: 4 } });
  }
  async score(files: Prepared[]) {
    const c = this.config;
    const tasks = files.flatMap((file) =>
      file.boundaries.map((index) => ({ file, index })),
    );
    const batches = Array.from(
      { length: Math.ceil(tasks.length / c.batchSize) },
      (_, i) => tasks.slice(i * c.batchSize, (i + 1) * c.batchSize),
    );
    if (c.cache) await mkdir(c.cache, { recursive: true });
    const scoreBatch = async (
      batch: (typeof batches)[number],
    ): Promise<void> => {
      const questions: Record<string, NoulQuestion> = {};
      batch.forEach(({ file, index }, i) => {
        if (c.questionStyle === "windows") {
          questions[`b${i}`] = {
            type: "noul",
            instructions: {
              question:
                "Should one empty line be inserted at the boundary between before and after?",
              before: file.lines
                .slice(Math.max(0, index - c.context), index)
                .join("\n"),
              after: file.lines.slice(index, index + c.context).join("\n"),
            },
          };
          return;
        }
        questions[`b${i}`] = {
          type: "noul",
          instructions: {
            question:
              "According to the paragraph policy in state, should there be a blank line at the marked boundary?",
            lineImmediatelyBefore: file.lines[index - 1],
            lineImmediatelyAfter: file.lines[index],
            code: [
              ...file.lines.slice(Math.max(0, index - c.context), index),
              "<<< BLANK LINE HERE? >>>",
              ...file.lines.slice(index, index + c.context),
            ].join("\n"),
          },
          criteria: {
            true: "The boundary starts a new paragraph under the policy.",
            false: "The boundary lies within one paragraph under the policy.",
          },
        };
      });
      const request = { model: c.model, state: c.prompt, questions };
      const key = createHash("sha256")
        .update(JSON.stringify(request))
        .digest("hex");
      const cacheFile = c.cache && join(c.cache, `${key}.json`);
      let response;
      if (cacheFile) {
        try {
          response = JSON.parse(await readFile(cacheFile, "utf8"));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      if (!response) {
        try {
          response = await this.client.systemOne(request);
        } catch (error) {
          const oversized =
            (error as { status?: number }).status === 400 &&
            String(error).includes("max_tokens_exceeded");
          if (!oversized) throw error;
          if (batch.length === 1)
            throw Object.assign(
              new Error(
                `A single spacing question exceeds Jev's token limit: ${batch[0].file.file}:${batch[0].index}`,
                { cause: error },
              ),
              { sourceFile: batch[0].file.file },
            );
          const middle = Math.ceil(batch.length / 2);
          await scoreBatch(batch.slice(0, middle));
          await scoreBatch(batch.slice(middle));
          return;
        }
        this.requests++;
        this.questions += batch.length;
        this.inputTokens += response.usage.input_tokens;
        this.outputTokens += response.usage.output_tokens;
        if (cacheFile) await writeFile(cacheFile, JSON.stringify(response));
      }
      this.models.add(response.model);
      batch.forEach(({ file, index }, i) => {
        const answer = response.answers[`b${i}`];
        if (
          answer?.type !== "noul" ||
          typeof answer.noul !== "number" ||
          !Number.isFinite(answer.noul) ||
          answer.noul < 0 ||
          answer.noul > 1
        )
          throw new Error(`Invalid Jev answer for ${file.file}:${index}`);
        file.probabilities[index] = answer.noul;
      });
    };
    await parallel(batches, c.concurrency, scoreBatch);
  }
}

export function render(file: Prepared, threshold = defaults.threshold): string {
  for (const index of file.boundaries)
    if (file.probabilities[index] === undefined)
      throw new Error(`Missing spacing decision: ${file.file}:${index}`);
  return (
    file.lines
      .map(
        (line, i) =>
          (file.probabilities[i] !== undefined &&
          file.probabilities[i] * 100 >= threshold
            ? "\n"
            : "") + line,
      )
      .join("\n") + (file.lines.length ? "\n" : "")
  );
}

export async function writeResult(file: Prepared, output: string) {
  if (output === file.original) return;
  if ((await readFile(file.file, "utf8")) !== file.original)
    throw new Error(`File changed during formatting: ${file.file}`);
  const temporary = join(dirname(file.file), `.spacer-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, output, {
      mode: (await stat(file.file)).mode,
      flag: "wx",
    });
    await rename(temporary, file.file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
