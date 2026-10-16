# Spacer playground

## Web app

Void + React, targeting Node.js (24.21+). From the workspace root:

```sh
mise //pkgs/playground:dev
```

The mise monorepo task runs `fnox exec -- pnpm dev` in `pkgs/playground`, inheriting the workspace tools and loading the Jev key through fnox.

Open http://localhost:5173. Paste JS/TS source, set its filename (including `.tsx` for JSX), choose **Spacer · local model** or **Jev · API**, and click **Format code**. Output has plain text and a syntax-highlighted unified diff using [`@pierre/diffs`](https://diffs.com/). The diff compares the submitted input snapshot to its result, including oxfmt normalization and spacing changes. Later edits are marked as stale until another run.

`POST /api/format` accepts `{ source, filename, backend: "spacer" | "jev" }` and returns `{ output, backend, elapsedMs, boundaries }`. Both backends run on the server; the API key stays server-side. Spacer lazily loads and reuses `tmp/spacer-lines-ts`, with its validation-selected threshold. Set `SPACER_MODEL_DIR` to an absolute line-model directory path to choose another trained model. Jev uses the formatter defaults and requires `TYPESAFE_API_KEY`.

```sh
mise exec -- pnpm --filter @spcr/playground build
mise exec -- pnpm --filter @spcr/playground start
# Built app: http://localhost:3000 (override with PORT)
```

Run the app through these package scripts, whose working directory is `pkgs/playground`. Native TensorFlow is loaded through Node from sibling `pkgs/model/src/predict.ts`; keep the workspace, installed model dependencies, and local model artifacts available when running the built server. Output is returned to the browser without writing source files.

## CLI

Node-native TypeScript formatter: **oxfmt → remove formatting-only empty lines → Jev Noul decisions → insert blank lines → write**.

See [EXPERIMENTS.md](EXPERIMENTS.md) for the five-repo tuning process and 25-repo evaluation results.

From the workspace root:

```sh
pnpm install
fnox exec -- node pkgs/playground/src/cli.ts ./path/to/source
fnox exec -- node pkgs/playground/src/cli.ts ./path/to/source \
  --context 5 --threshold 55 --batch-size 128 --concurrency 8 \
  --cache ./tmp/spacing-cache --report ./tmp/decisions.json
```

`--check` calculates formatting without writing, exiting 1 when files differ. `--config .oxfmtrc.json` passes explicit JSON options to oxfmt; otherwise its defaults apply. The API key is read by the TypeSafe SDK from `TYPESAFE_API_KEY`; use `fnox exec --` as above.

## Algorithm

- Recursively discovers `.ts`, `.tsx`, `.mts`, `.cts`, including declarations; respects nested `.gitignore` and `.spacerignore`. Skips symlinks, dependencies and common build directories.
- Normalizes each file with the oxfmt JS API. Blank-line analysis is based on normalized code, not the input's spacing.
- The TypeScript parser identifies boundaries between statements, declarations, members and switch cases. Jev judges each such boundary with **five retained lines of context on each side** by default. This sliding window avoids missing boundaries that fall inside fixed-size chunks. Continuations, brace padding and boundaries splitting attached comments/decorators are structurally excluded.
- Syntax-aware protection preserves normalized multiline strings, templates, comments and JSX subtrees. Their internal boundaries are never submitted to Jev. This deliberately preserves whitespace that could carry meaning.
- Shared formatting rules go in `state`; each Noul question contains a marked code window, the two immediately adjacent lines, and yes/no criteria. Questions are batched across files and batches run concurrently. Defaults: 128 questions/request, 8 in-flight requests, 55% insertion threshold. SDK retries transient errors and rate limits, with a 120-second per-attempt timeout.
- The active state prompt is **ordered responsibilities**, with a neutral policy-based question and criteria. It groups declarations with the processing step they support. The prose-only prompt and earlier comparisons are documented in [PROMPT-EXPERIMENT.md](PROMPT-EXPERIMENT.md).
- Stores all probabilities before rendering a file. A probability **≥ threshold/100** inserts exactly one empty line. No subsequent oxfmt pass overwrites these choices.
- Processes groups of 32 files to bound memory; writes each completed file atomically, checking for concurrent edits. A failed batch prevents writes for its group; earlier groups may already be written.
- Optional response caching includes model, prompt and questions in its hash. Threshold changes can reuse scores. `jev-latest` may change upstream: pin `--model` or use a new cache directory when re-evaluating a model release.

## Experiments

### Full-repository baseline comparison

```sh
# Resets the 25 clones to tmp/repos.json commits and discards their local changes.
node pkgs/playground/src/full-run.ts baseline
fnox exec -- node pkgs/playground/src/full-run.ts space
node pkgs/playground/src/full-run.ts report
node pkgs/playground/src/diff-examples.ts
```

This normalizes all discovered, tracked TypeScript files using the same oxfmt options as Spacer, commits a baseline in each clone, then runs spacing in resumable groups. Uses 16 concurrent requests. Parse failures, non-idempotent oxfmt inputs, and individual questions over Jev's token limit are recorded as skipped. Oversized multi-question requests are split automatically. Results are written to `tmp/full-run/`: per-file CSV/JSON/Markdown, repository totals, baseline commit IDs, raw diffs, and 30 excerpts containing 45 diff-body lines each. `space` resumes recorded progress; run `baseline` only when intentionally restarting (it resets the progress records).

Set `SPACER_RUN_DIR` to keep a new pass separate, for example `tmp/full-run-ordered`. Spacing processes groups of 64 files round-robin across repositories. HTTP 402 ends API processing gracefully after persisting fully scored files; partially scored files stay at baseline and are not recorded as successful. `usage.json` records whether credits were exhausted. Corpus generation independently verifies every recorded file's full set of boundary scores before using its after-state.

### Sampled prompt tuning

```sh
# Run from workspace root. Selection/ranking data is kept under tmp/.
curl -fsSL 'https://api.github.com/search/repositories?q=language:TypeScript+stars:>20000+archived:false&sort=stars&order=desc&per_page=60' -o tmp/github-top.json
node pkgs/playground/src/repos.ts 5
fnox exec -- node pkgs/playground/src/experiment.ts 5 baseline 3
fnox exec -- node pkgs/playground/src/experiment.ts 5 tuned 3
fnox exec -- node pkgs/playground/src/experiment.ts 5 marked 3
fnox exec -- node pkgs/playground/src/experiment.ts 5 final 3
fnox exec -- node pkgs/playground/src/experiment.ts 5 syntax 3
node pkgs/playground/src/repos.ts 25
fnox exec -- node pkgs/playground/src/experiment.ts 25 evaluation 3
```

Samples three implementation files per repository using stable path hashes, 50–220 input lines each, excluding generated code, fixtures and tests. Writes complete formatted samples, spacing-only diffs against oxfmt, probabilities, token usage and timing to `tmp/experiments/<label>/`. Verifies unchanged parsed token content and stable normalized inputs on a second formatting pass. Source clones stay available under `tmp/<owner>--<repo>/`. Existing blank lines are a comparison signal, not ground truth. The historical `baseline`, `tuned`, `marked` and `final` labels compare all unprotected line boundaries; `syntax` and `evaluation` use the production structural candidates.

```sh
pnpm check
pnpm test
```
