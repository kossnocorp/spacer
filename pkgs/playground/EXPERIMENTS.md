# Jev spacing experiments

## Corpus and method

Executed against `jev-1.13.0` through the TypeSafe JavaScript SDK, with the key supplied by `fnox exec --`. Repositories were selected from GitHub's star-ranked TypeScript search: popular, substantial codebases rather than a strict top-25 list (which also contains curriculum/content repositories).

- Five tuning repositories: VS Code, Angular, Excalidraw, Supabase and n8n.
- Expanded evaluation: 25 repositories total, including **20 additional repositories**.
- Three stable-hash-selected files per repository, 50–220 input lines. No selection based on existing blank-line quality. Some samples are UI demos, stories or configuration files.
- Each selected file was formatted in full. These were **sampled evaluations, not whole-repository rewrites**.
- Compare against oxfmt-normalized code to isolate blank-line changes. Existing whitespace is a style reference, not a correctness oracle.
- Clones: `tmp/<owner>--<repo>/`. GitHub search results: `tmp/github-top.json`. Exact clone commits and star counts: `tmp/repos.json`.
- Full samples, diffs, probabilities, request configuration and resolved model: `tmp/experiments/<stage>/`.

## Tuning observations

Reviewed all 15 initial file diffs after each major iteration.

| Stage | Existing breaks kept | New breaks | Existing breaks removed |
| --- | ---: | ---: | ---: |
| Broad prompt, separate windows, 65% | 143 | 336 | 24 |
| Detailed rules, separate windows, 65% | 88 | 71 | 79 |
| Detailed rules, explicit marker + criteria, 65% | 94 | 7 | 73 |
| Shorter phase-oriented rules, marker, 55% | 120 | 43 | 47 |
| Structural candidates, phase rules, 55% | 116 | 16 | 51 |

The broad prompt frequently separated comments from declarations, padded braces and split argument lists. More rules alone did not reliably locate the boundary. Explicitly marking the insertion point and repeating its immediately adjacent lines produced the largest improvement.

The final version uses TypeScript statement/member boundaries to exclude structural non-candidates. This reduced the five-repo question count from 1,194 to about 492. Jev still decides spacing between eligible code units. A 55% threshold balances restoring useful phase separation against excessive new blank lines. The prompt was shortened to emphasize processing phases, with one general rule keeping immediate component/function metadata assignments attached.

## Expanded evaluation

75 files; **2,268 questions in 18 requests**, with up to eight simultaneous requests and 128 questions/request. Recorded usage: 718,173 input tokens and 41,192 output tokens. The measured scoring/verification/artifact-writing phase took 1.991 seconds; cloning, discovery and initial normalization are excluded.

| Repository | Kept | Added | Removed |
| --- | ---: | ---: | ---: |
| microsoft/vscode | 42 | 9 | 18 |
| angular/angular | 18 | 0 | 4 |
| excalidraw/excalidraw | 14 | 4 | 7 |
| supabase/supabase | 25 | 1 | 12 |
| n8n-io/n8n | 19 | 0 | 8 |
| freeCodeCamp/freeCodeCamp | 9 | 0 | 7 |
| openclaw/openclaw | 18 | 9 | 2 |
| vuejs/vue | 28 | 3 | 6 |
| firecrawl/firecrawl | 25 | 9 | 5 |
| langgenius/dify | 17 | 3 | 2 |
| shadcn-ui/ui | 14 | 1 | 3 |
| immich-app/immich | 19 | 3 | 31 |
| google-gemini/gemini-cli | 15 | 1 | 4 |
| ant-design/ant-design | 20 | 0 | 8 |
| tailwindlabs/tailwindcss | 17 | 0 | 24 |
| microsoft/playwright | 52 | 19 | 10 |
| puppeteer/puppeteer | 24 | 10 | 5 |
| storybookjs/storybook | 20 | 3 | 14 |
| mermaid-js/mermaid | 25 | 4 | 19 |
| vitejs/vite | 18 | 10 | 4 |
| hoppscotch/hoppscotch | 11 | 0 | 15 |
| nestjs/nest | 20 | 7 | 6 |
| strapi/strapi | 21 | 1 | 9 |
| withastro/astro | 21 | 6 | 6 |
| facebook/docusaurus | 21 | 3 | 3 |
| **Total** | **533** | **106** | **232** |

Of proposed blank lines, 83.4% matched existing spacing; 69.7% of existing blank lines were retained. These are **agreement metrics**, not measured formatting accuracy. The 20 additional repositories separately achieved 81.9% agreement precision and 69.4% recall. No repository-specific prompt rules were added after this evaluation.

Inspected the highest-churn sample diff from every repository, in addition to the complete five-repo tuning diffs. Useful additions include validation-to-processing transitions in VS Code, Astro and Playwright, and separation between Puppeteer getters. It also removes excessive spacing between tightly related setup variables.

Remaining tradeoffs: spacing is denser than Tailwind/Mermaid in some functions; external/local import grouping is inconsistent; decorated ORM fields in Immich and switch cases in Hoppscotch lose useful grouping. Five-line context cannot always reveal the larger phase structure. The configurable threshold/context allow adjusting that preference without repository-specific rules.

## Verification

- All 75 evaluation outputs retained identical parsed token kinds/text relative to oxfmt output, including template/JSX token content.
- Re-normalizing every output produced the same retained lines and candidate boundaries.
- Ran the actual recursive CLI on copies of all 75 original samples. A cached second `--check` pass reported **zero changes and zero requests**.
- Unit coverage includes protected whitespace, structural/comment/decorator boundaries, concurrent batching, probability validation, thresholding and concurrent-edit protection.

See [README.md](README.md) for commands and options. Raw historical request prompts are recorded in each experiment's `summary.json`; model output can vary across releases or fresh requests. Caching makes repeated runs reproducible for identical batches.
