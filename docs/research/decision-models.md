# Recent Jev-like decision models

Research snapshot: **2026-10-17**. Focus: September–October 2026 releases and
updates relevant to Spacer's blank-line decisions. This is a source review, not
a Spacer accuracy or performance benchmark. Prices below are USD per **million
input tokens**, not per decision; hosting routes, billing semantics and versions
matter. Vendor benchmark results are attributed claims, not independently
reproduced results.

## Summary and recommended shortlist

Jev's useful abstraction is a bounded decision with a numerical probability,
rather than generated prose or rewritten source. Spacer's question—whether a
blank line belongs at a particular safe boundary—is a natural binary decision.
The recently released alternatives broadly support that abstraction, but are
not all wire-compatible, equally calibrated, or equally economical in batches.

Recommended first comparisons:

1. **Hosted teacher candidates:** pinned Jev 1.13/1.14, Microsoft-Decision-1,
   Perplexity Decider v1.2/Flash, and Liquid d1-ultra. Compare on identical gaps,
   contexts and question wording before replacing the existing teacher.
2. **Local research candidates:** Strands Decider 2B for its published training
   recipe; Liquid d1-3B for its small size and inference options;
   H2O-Lightning-4B for its inspectable readout and serving implementation.
3. **Cloudflare option:** Clef-flash, then Clef. Existing Cloudflare infrastructure
   makes these convenient, but confirm the effective text limit for the actual
   serving route before sending large batches.

These are general language models adapted for decisions, usually billions of
parameters. They are plausible teachers or richer baselines, not automatically
better replacements for Spacer's small, specialized CPU models. No source
reviewed establishes superior blank-line formatting accuracy.

## Release and capability map

| Model / family                           | Recent milestone                                                                 | Access / architecture                                                                         | Reported input price                                             | Spacer relevance                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Jev 1.14**                             | Oct 14 release; 1.13 remains the documented stable alias target                  | TypeSafe hosted System One API; closed weights                                                | $0.042                                                           | Direct baseline; same `noul` question type we already use. [1]                                                                    |
| **Microsoft-Decision-1**                 | Oct 9 announcement                                                               | Foundry and OpenRouter; Qwen3.5-9B post-trained for single-pass scoring                       | $0.042                                                           | Strong hosted comparison, with vendor evaluation of accuracy, calibration and perturbation stability. [2]                         |
| **Clef / Clef-flash / Clef-omni**        | Clef/Flash Oct 1; Omni and serving/price updates Oct 9                           | Cloudflare Workers AI; downloadable weights; Clef 27B, Flash 9B, Omni 30B/3B-active MoE       | Workers AI: $0.24 / $0.038 / $0.15                               | Jev-compatible questions; self-hosting/fine-tuning possible. Omni's audio/video features add little for text-only spacing. [3][4] |
| **Strands Decider 2B**                   | Oct 1 announcement                                                               | Open model and training materials; Qwen3.5-2B torso, ~1M-parameter pointer head, rank-16 LoRA | Self-hosting cost, no comparable API tariff established here     | Particularly useful as an inspectable small-model training reference. [5]                                                         |
| **Liquid d1 / d1-ultra**                 | d1 vision announcement Oct 5; Ultra Oct 15                                       | Hosted decision models; text and images                                                       | d1: Oct 5 comparison used $0.04; Ultra launch: $0.042            | Direct System One-shaped API. Each question is billed as its own prompt: shared context can multiply cost. [6][7][8]              |
| **Liquid d1-3B / d1-omni-600M**          | Oct 7 release                                                                    | Open weights, 3.1B / 587M, LFM Open License; decoder-based 3B and encoder-based Omni          | Self-hosting cost                                                | Smaller local alternatives; 3B is the stronger initial candidate for text decisions. [9][10]                                      |
| **H2O-Lightning-4B**                     | Oct 7 benchmark announcement; subsequent versioned updates visible in model card | Apache-2.0 Qwen3.5-4B-derived model; vLLM plus a Python decision shim                         | Self-hosting cost; leaderboard cost estimates are not API prices | Strong local research candidate, but distinguish weights, attention mode and probability postprocessing. [11][12]                 |
| **Perplexity Decider v1.2 / Flash v1.2** | October changelog; OpenRouter search listing dates v1.2 to Oct 16                | Hosted 27B / 4B decision models; text and images                                              | $0.02 / $0.01                                                    | Joint question processing and shared-state billing are promising for many gaps per file. [13][14]                                 |
| **OpenAI GPT-6 Luna Decisions**          | Public beta documented at review time; precise launch date not established here  | Hosted `/v1/decisions`, model `gpt-6-luna`; text/images                                       | $0.10, with regional/long-context adjustments                    | Useful independent baseline; native schema needs an adapter (`predicate`, not `noul`). [15]                                       |

## Important details by family

### Jev: pin the version, not just “latest”

TypeSafe's current model page maps `jev-latest` to `jev-1.13.0` and
`jev-preview` to `jev-1.14.0`. The newest release and the stable alias therefore
are not synonymous. The response reports the resolved version. Default limits
are 64k tokens per request and 32k for state plus one question; an opt-in header
raises both to approximately 262k. TypeSafe explicitly describes that long-context
mode as slower and less accurate. [1]

Keep the playground's alias convenient for exploration, but pin the exact ID and
record the returned ID for labeling experiments. The TypeSafe models page lists
text as the regular input modality, while OpenRouter's newer guide documents
image/Box features. This surface/preview distinction does not affect Spacer's
text-only requests; it should not be flattened into a universal capability claim.

### Microsoft-Decision-1: hosted comparison with changing weights

Microsoft reports evaluation on 36 benchmarks covering nearly 150,000 questions,
and an average decision-flip rate of 1.3% under eight input perturbations. Those
are vendor-selected task results, not evidence about code paragraphing. The
announcement says the Qwen3.5-9B basis will change in future updates. Treat the
model name as a service identity, not proof of immutable weights. Record request
date, provider and any revision information the service exposes. [2]

### Clef: promising training recipe; hosting limits need verification

Cloudflare describes a prefill-only backbone plus option-specific routing and
schema-bound scoring, trained with LoRA, label-smoothed cross-entropy, Brier loss
and RLCD. The Oct 1 release describes Apache-2.0 availability. [3]

The Oct 9 update advertises a 24k hosted context for Flash and 64k for Clef;
self-hosted Flash weights are described as supporting 256k. It reports Clef
median/p95 latency of 152/351 ms at roughly 800 tokens and 305/531 ms at roughly
3,400 tokens. These are Cloudflare's measurements. [4]

There is a material documentation discrepancy: OpenRouter's indexed Clef model
description warns that Workers AI truncates text state to roughly the first 2k
tokens. That conflicts with simply treating the advertised context as fully read
state. Verify the chosen route with evidence placed near the end of a long state,
and record provider routing. Do not silently accept truncated teacher inputs.
OpenRouter provider prices also differ from Workers AI's direct prices. [16]

### Strands: the best starting point for understanding the recipe

The primary announcement describes a Qwen torso whose generation head is replaced
by a pointer head comparing option-position and answer-position hidden states.
Code, data, training scripts and checkpoints are published. Its announcement
names v19, while some secondary reports name v20: use a checkpoint revision,
not the launch article as a weight identifier. [5]

Strands reports around 115 ms local median on an RTX 3090 and about 153 ms for
small tasks on an M3 MacBook, with a graph measured on v18. These are not directly
comparable with hosted API latency or Spacer's batched LOC/s. Its API integration
is a separate task; sharing the decision abstraction does not establish a
drop-in TypeSafe HTTP endpoint.

### Liquid: inexpensive API rates can hide repeated context billing

The direct API uses `https://api.liquid.ai/decisions/v1/systemone` and accepts
`noul`, `choice` and `score`. Liquid documents that each question is billed for
its prompt, including supplied images. A request containing 128 questions should
not be costed as if a large common state were necessarily billed once. [8]

The open models use the **LFM Open License**, not Apache-2.0. d1-3B is derived
from LFM2.5-VL-3B; Omni starts with a smaller bidirectional encoder and adds
modality encoders. Liquid reports 8 ms for one question on an RTX 4090, but
102 ms for a 3.4k-token state on the same device. Input size matters much more
than a headline single-question number suggests. The documented llama.cpp and
AMD inference options are relevant to our environment, but we have not validated
them on this machine. [9][10]

The Oct 15 Ultra announcement says OpenRouter support is coming; the current
Liquid docs list it as available. Prefer the current provider docs, then verify
access with an actual account. A model catalog listing alone is not a successful
inference test. [7][8]

### H2O: distinguish native probabilities from the shipped serving policy

The model card separates leaderboard v1.1 weights, measured v1.2.3 deployments
and newer v1.3 weights. Its newer two-way attention mode differs from the older
causal readout; the card documents vLLM pooling/generation configurations and
model-specific shims. Pin all of these, not just the model family. [11]

Most importantly, the documented default shim applies a `noul_floor` of **0.801
on the chosen side**: reported binary probabilities avoid the middle range.
The card offers `SHIM_NOUL_FLOOR=0` for rawer routing behavior. This directly
matters for Spacer: a threshold swept over the middle range may have no effect,
and probabilities used as soft training labels may be artificially sharpened.
Evaluate the shipped and floor-disabled configurations as separately named
systems; do not silently change a published benchmark's setup. [11]

H2O's reported 72.5 JevBench composite versus Jev's 71.5 is an aggregate of
intelligence, calibration, speed and estimated cost. It is not “72.5% accuracy”
and does not demonstrate better spacing decisions. [11][12]

### Perplexity: particularly relevant batch semantics

The direct endpoint is `/v1/decisions`, despite its Jev-like `state`, named
`questions` and `answers` shape. The API supports up to 128 questions, 255 choice
options and 10 score levels, with a 256k context. Current docs list 10 requests
per second per organization, shared between model sizes. [13][14]

v1.2 processes questions jointly: they can see one another, and the state is
read/billed once. Consequently, changing question grouping can change answers.
For Spacer, batch size and boundary order are part of the experimental setup,
not just performance knobs.

Older names are documented as routing to v1.2, and the response echoes the
requested model name rather than necessarily identifying resolved weights.
Pinning an old-looking string is insufficient to freeze the service. The v1.2
model card also describes access-controlled repository downloads; do not assume
older open-weight release announcements imply unrestricted current weights. [17]

### OpenAI: a similar abstraction with a different native contract

OpenAI's public beta uses `POST https://api.openai.com/v1/decisions`, `input`
instead of `state`, and a named-question array instead of a map. A binary
question is `predicate`; its answer uses `probability`. Answers may be refusals,
which must not be converted to negative spacing labels. The direct model ID is
`gpt-6-luna`; OpenRouter lists `openai/gpt-6-luna-decisions`. These are provider
identifiers, not interchangeable strings for the same endpoint. [15][18]

## API compatibility for this repository

Current teacher code uses `@typesafe-ai/sdk`, batched `noul` questions, and
validated probabilities. Integration opportunities:

| Route                      | Integration work                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeSafe Jev               | Already supported. Supply a browser key or server `TYPESAFE_API_KEY`; see [local setup](../../pkgs/playground/LOCAL-JEV.md).                                           |
| Jev through OpenRouter     | TypeSafe SDK base URL `https://openrouter.ai/api`, OpenRouter key; SDK appends `/v1/systemone`. Alias resolution can differ from direct TypeSafe. [19]                 |
| OpenRouter decision models | Shared `/api/alpha/decisions` contract is documented. Verify per-model schema/limits and availability; this research does not add those models to the playground. [18] |
| Liquid direct              | System One-shaped request; configure correct base path/model/key in a future provider adapter. Confirm usage semantics. [8]                                            |
| Perplexity direct          | Similar body, different `/v1/decisions` path; the SDK's automatic `/v1/systemone` suffix is not a base-URL-only solution. [13]                                         |
| OpenAI direct              | Translate question maps to arrays and `noul` to `predicate`; validate refusals and map named answers back to boundaries. [15]                                          |
| H2O self-hosted            | Shim exposes `/v1/systemone`; verify SDK response compatibility and serving configuration before swapping it in. [11]                                                  |
| Strands / open Liquid      | Local runtime or server adapter; pin weights, tokenizer, precision and readout/calibration configuration.                                                              |

OpenRouter's Oct 16 overview lists 22 models from 13 makers, including Inception
Mercury Decide, Upstage Solar Decide, Nace.AI, Respan and others. This establishes
a broader candidate pool, not a quality ranking. Direct fetches of several
OpenRouter model pages returned 404 during this review even though search and
the documentation listed them. Availability, exact release dates and prices for
those additional candidates were not verified here. [18]

## Proposed Spacer evaluation

1. Freeze a development comparison corpus with identical file groups, candidate
   gaps and source representations. Keep existing test files out of prompt,
   model, threshold and batching selection. Include several languages with
   human-reviewed spacing labels; current TS/TSX teacher labels cannot establish
   cross-language accuracy or an independent teacher-quality ranking.
2. Ask the same binary question with the same before/after context. Also measure
   whether full-function context helps, as a separate controlled condition.
   Record prompt hash, model/provider, revision/date, question order and batching.
3. Report log loss, Brier score, calibration curves, precision/recall/F1 and
   teacher-changed-boundary results. Select thresholds on validation only.
   Include explicit failure/refusal/truncation rates rather than dropping errors.
4. Measure end-to-end p50/p95, boundaries/s, LOC/s and actual cost per 1,000 gaps
   at matched context and concurrency. Keep cold-start and warm measurements
   distinct. Count retries and repeated per-question state in billed usage.
5. Test invariance to existing blank lines, identifier renaming, question order
   and batch partitioning. Check source preservation through the same Tree-sitter
   renderer for every model; no oxfmt preprocessing in interactive inference.
6. Freeze the selected system before one final held-out evaluation. Preserve
   teacher probabilities, failure records and exact model provenance when making
   a new dataset version; retain previous labels/artifacts for comparison.

No new provider inference, model downloads or benchmark runs were performed for
this research document.

## Sources

All accessed or searched on 2026-10-17. Primary vendor documentation is preferred;
announcements and living model cards can change independently of one another.

1. [TypeSafe models, aliases, pricing and context limits](https://docs.typesafe.ai/models).
2. [Microsoft-Decision-1 announcement, Oct 9](https://commandline.microsoft.com/microsoft-decision-1-model-foundry/).
3. [Cloudflare Clef launch and training recipe, Oct 1](https://blog.cloudflare.com/clef-decision-models/).
4. [Cloudflare Omni, pricing and serving update, Oct 9](https://blog.cloudflare.com/clef-faster-cheaper-multimodal/).
5. [Strands Decider 2B announcement, Oct 1](https://strandsagents.com/blog/introducing-strands-decider/); [source repository](https://github.com/strands-labs/strands-decider).
6. [Liquid d1 announcement, Oct 5](https://www.liquid.ai/blog/d1-decision-model).
7. [Liquid d1-ultra announcement, Oct 15](https://www.liquid.ai/blog/d1-ultra).
8. [Liquid hosted decision API and billing](https://docs.liquid.ai/lfm/models/d1).
9. [Open d1 announcement and hardware measurements, Oct 7](https://www.liquid.ai/blog/d1-open).
10. [Liquid decision family and license overview](https://docs.liquid.ai/lfm/models/decision-models).
11. [H2O-Lightning-4B model card and serving policy](https://huggingface.co/h2oai/h2o-lightning-4b/blob/main/README.md) (full raw card retrieved).
12. [H2O JevBench announcement, Oct 7](https://h2o.ai/blog/2026/h2o-lightning-jevbench).
13. [Perplexity Decisions quickstart, billing and batching](https://docs.perplexity.ai/docs/decisions/quickstart).
14. [Perplexity Decisions API reference](https://docs.perplexity.ai/api-reference/decisions-post); [October changelog](https://docs.perplexity.ai/docs/resources/changelog).
15. [OpenAI Decisions API guide and pricing](https://developers.openai.com/api/docs/guides/decisions).
16. [OpenRouter Clef model description](https://openrouter.ai/cloudflare/clef) (search-indexed provider/context information).
17. [Perplexity v1.2 model card](https://huggingface.co/perplexity-ai/pplx-decider-v1.2) (search-indexed card); [OpenRouter v1.2 listing](https://openrouter.ai/perplexity/pplx-decider-v1.2) (Oct 16 date from search; direct page fetch returned 404).
18. [OpenRouter Jev and other decision-model overview](https://openrouter.ai/docs/guides/community/jev).
19. [OpenRouter TypeSafe SDK compatibility guide](https://openrouter.ai/docs/guides/community/typesafe-sdk).
