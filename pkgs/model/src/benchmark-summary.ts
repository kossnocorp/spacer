import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { examples } from "../../playground/src/examples/catalog.ts";

const [family, language] = process.argv.slice(2);
const chart = (
  title: string,
  labels: string[],
  unit: string,
  values: number[],
  maximum?: number,
) => `\`\`\`mermaid
xychart-beta horizontal
  title "${title}"
  x-axis [${labels.map((label) => JSON.stringify(label
    .replace(" (Jev-trained)", " Jev")
    .replace(" (original-trained)", " original")
    .replace("Bilingual Lines", "Lines")
    .replace("Cross-attention", "Tree"))).join(", ")}]
  y-axis "${unit}" 0 --> ${maximum ?? Math.ceil(Math.max(...values) * 1.1)}
  bar [${values.join(", ")}]
\`\`\``;
const directories = {
  lines: "tmp/spacer-lines-ts",
  attention: "tmp/spacer-tree-sitter-cross-attention-1",
  "lines-mixed": "tmp/spacer-lines-mixed-1",
  "attention-original": "tmp/spacer-tree-sitter-cross-attention-original-1",
};
const familyNames: Record<string, string> = {
  lines: "Lines (Jev-trained)",
  attention: "Cross-attention (Jev-trained)",
  "lines-mixed": "Bilingual Lines (original-trained)",
  "attention-original": "Cross-attention (original-trained)",
};
if (family) {
  const { LocalSpacer } = await import("./predict.ts");
  const { AttentionSpacer } = await import("./attention-predict.ts");
  const { prepareDocument, renderDocument, closeParsers } =
    await import("@spcr/tree-sitter");
  const directory = directories[family as keyof typeof directories];
  if (!directory) throw new Error("Unknown benchmark family");
  const input = examples.find((example) => example.id === language)!;
  if (!input) throw new Error("Unknown example language");
  const model =
    family === "lines" || family === "lines-mixed"
      ? await LocalSpacer.load(directory)
      : await AttentionSpacer.load(directory);
  const format = async () => {
    const document = await prepareDocument(
      input.withoutSpacing,
      input.filename,
    );
    const scores =
      model instanceof LocalSpacer
        ? await model.scoreDocument(document)
        : await model.score(document);
    await renderDocument(document, scores, model.threshold);
  };
  const durations: number[] = [];
  const cpuTimes: number[] = [];
  try {
    await format();
    const warmRss = process.memoryUsage().rss;
    for (let i = 0; i < 20; i++) {
      const cpu = process.cpuUsage(),
        start = performance.now();
      await format();
      durations.push(performance.now() - start);
      const used = process.cpuUsage(cpu);
      cpuTimes.push((used.user + used.system) / 1000);
    }
    const lines =
      input.withoutSpacing.split("\n").length -
      Number(input.withoutSpacing.endsWith("\n"));
    const elapsed = durations.reduce((a, b) => a + b, 0);
    const sorted = [...durations].sort((a, b) => a - b);
    const weights = await readFile(`${directory}/best/weights.bin`);
    console.log(
      JSON.stringify({
        family,
        language,
        directory,
        lines,
        repetitions: 20,
        locPerSecond: (lines * 20 * 1000) / elapsed,
        p95Ms: sorted[18],
        cpuPercent: (100 * cpuTimes.reduce((a, b) => a + b, 0)) / elapsed,
        cpuMsPerKloc:
          (cpuTimes.reduce((a, b) => a + b, 0) * 1000) / (lines * 20),
        peakRssMiB: process.resourceUsage().maxRSS / 1024,
        warmRssMiB: warmRss / 1048576,
        weightsMiB: weights.length / 1048576,
        weightsSha256: createHash("sha256").update(weights).digest("hex"),
        configSha256: createHash("sha256")
          .update(await readFile(`${directory}/config.json`))
          .digest("hex"),
        threshold: model.threshold,
        input: {
          repository: input.repository,
          commit: input.commit,
          path: input.path,
          sha256: createHash("sha256")
            .update(input.withoutSpacing)
            .digest("hex"),
        },
        durations,
        cpuTimes,
      }),
    );
  } finally {
    model.dispose();
    await closeParsers();
  }
} else {
  const created = new Date().toISOString();
  const root = `docs/benchmark-data/runs/${created.replaceAll(":", "-")}-summary`;
  await mkdir(root, { recursive: true });
  // Retain the previous report before replacing it.
  await writeFile(
    `${root}/previous-benchmark.md`,
    await readFile("docs/benchmark.md", "utf8"),
  );
  const results: {
    family: string;
    language: string;
    lines: number;
    locPerSecond: number;
    p95Ms: number;
    cpuPercent: number;
    cpuMsPerKloc: number;
    peakRssMiB: number;
    weightsMiB: number;
  }[] = [];
  for (const family of Object.keys(directories))
    for (const language of ["typescript", "rust"]) {
      console.log(`Benchmarking ${family}/${language}`);
      const child = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url), family, language],
        { encoding: "utf8", maxBuffer: 10_000_000 },
      );
      if (child.status !== 0) throw new Error(child.stderr || child.stdout);
      results.push(JSON.parse(child.stdout.trim().split("\n").at(-1)!));
    }
  const heldOut = JSON.parse(
    await readFile("docs/benchmark-data/lines-mixed-v1/held-out.json", "utf8"),
  );
  if (!heldOut.complete)
    throw new Error("Bilingual held-out evaluation is incomplete");
  const scoring = JSON.parse(
    await readFile(
      "docs/benchmark-data/lines-mixed-v1/performance.json",
      "utf8",
    ),
  );
  const teacher = JSON.parse(
    await readFile("reports/research-v2/final-test.json", "utf8"),
  );
  if (!teacher.complete) throw new Error("Teacher evaluation is incomplete");
  const configs = Object.fromEntries(
    await Promise.all(
      ["lines-typescript", "lines-rust", "cross-attention-mixed"].map(
        async (name) => [
          name,
          JSON.parse(
            await readFile(
              `tmp/research-v2-original-gpu/${name}-seed42/config.json`,
              "utf8",
            ),
          ),
        ],
      ),
    ),
  );
  let jev:
    | {
        complete: boolean;
        results: {
          language: string;
          rows: number[];
          elapsedMs: number | null;
          response: {
            model: string;
            usage: { input_tokens: number; output_tokens: number };
          } | null;
        }[];
      }
    | undefined;
  try {
    jev = JSON.parse(
      await readFile("docs/benchmark-data/jev/results.json", "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const jevReport = jev?.complete
    ? `### Completed Jev economical probe

Saved provider responses, reused without additional API calls:

| Language | Model | Boundaries | Request latency ms | Input tokens | Output tokens |
| --- | --- | ---: | ---: | ---: | ---: |
${jev.results.map((r) => `| ${r.language} | ${r.response!.model} | ${r.rows.length} | ${r.elapsedMs!.toFixed(1)} | ${r.response!.usage.input_tokens} | ${r.response!.usage.output_tokens} |`).join("\n")}

${chart(
  "Jev request latency — lower is faster",
  jev.results.map((r) => r.language),
  "Milliseconds",
  jev.results.map((r) => Number(r.elapsedMs!.toFixed(1))),
)}

${chart(
  "Jev token usage per request",
  jev.results.flatMap((r) => [`${r.language} input`, `${r.language} output`]),
  "Tokens",
  jev.results.flatMap((r) => [
    r.response!.usage.input_tokens,
    r.response!.usage.output_tokens,
  ]),
)}

One request per language; latency includes the API round trip. This sampled-boundary probe does not establish full-file LoC/sec or corpus accuracy. Provider CPU/RAM and weights are unavailable. Unavailable Jev metrics are omitted from the main tables. Original timestamps and probabilities are in [cached results](benchmark-data/jev/results.json).
`
    : "Jev probe has not yet completed.";
  await writeFile(
    `${root}/results.json`,
    JSON.stringify(
      {
        created,
        cpu: cpus()[0]?.model,
        node: process.version,
        logicalCpus: cpus().length,
        results,
        originalConfigs: configs,
        teacher,
        heldOut,
        scoring,
        jev,
      },
      null,
      2,
    ),
  );
  const pct = (x: number) => (100 * x).toFixed(2);
  const ts = configs["cross-attention-mixed"].byLanguage.typescript;
  const rs = configs["cross-attention-mixed"].byLanguage.rust;
  const originalTs = configs["lines-typescript"].validation;
  const originalRs = configs["lines-rust"].validation;
  const old = teacher.results["historical-lines"].savedThreshold;
  const best = teacher.results["cross-attention-mixed-seed42"].savedThreshold;
  const table = results
    .map(
      (r) =>
        `| ${familyNames[r.family]} | ${r.language === "rust" ? "Rust" : "TS"} | ${Math.round(r.locPerSecond).toLocaleString("en-US")} | ${r.p95Ms.toFixed(1)} | ${r.cpuPercent.toFixed(1)} | ${r.cpuMsPerKloc.toFixed(1)} | ${r.peakRssMiB.toFixed(1)} | ${r.weightsMiB.toFixed(2)} |`,
    )
    .join("\n");
  const heldOutNames: Record<string, string> = {
    "baseline-seed42": "Bilingual Lines baseline",
    "context-dilated-seed42": "Bilingual Lines selected (seed 42)",
    "context-dilated-seed123": "Bilingual Lines confirmation (seed 123)",
    "cross-attention": "Cross-attention original-trained",
  };
  const heldOutKeys = Object.keys(heldOutNames);
  const heldOutTable = heldOutKeys
    .map((key) => {
      const r = heldOut.results[key].byLanguage;
      return `| ${heldOutNames[key]} | ${pct(r.typescript.accuracy)}% | ${pct(r.rust.accuracy)}% | ${pct(r.typescript.f1)}% | ${pct(r.rust.f1)}% | ${r.typescript.logLoss.toFixed(5)} | ${r.rust.logLoss.toFixed(5)} |`;
    })
    .join("\n");
  const shortNames = ["Baseline", "Selected", "Confirmation", "Tree"];
  const primary = heldOut.results[heldOut.plan.primary].byLanguage;
  const control = heldOut.results["cross-attention"].byLanguage;
  const scoringKeys = [
    "baseline-seed42",
    "context-small-seed42",
    "context-dilated-seed42",
    "cross-attention",
  ];
  const scoringNames = [
    "Lines baseline",
    "Lines context-small",
    "Lines selected",
    "Cross-attention",
  ];
  const formatComparison = ["typescript", "rust"]
    .map((language) => {
      const lines = results.find(
        (r) => r.family === "lines-mixed" && r.language === language,
      )!;
      const tree = results.find(
        (r) => r.family === "attention-original" && r.language === language,
      )!;
      return `**${language === "typescript" ? "TS" : "Rust"}: ${(lines.locPerSecond / tree.locPerSecond).toFixed(2)}× cross-attention throughput** (${Math.round(lines.locPerSecond).toLocaleString("en-US")} vs ${Math.round(tree.locPerSecond).toLocaleString("en-US")} LoC/sec)`;
    })
    .join("; ");
  const markdown = `# Spacer benchmark

Updated ${created}. **This report generation makes no Jev API calls.** ${jev?.complete ? "Approved Jev probe results are reused from the persistent cache below." : "Jev remains unmeasured pending approval."}

**Result:** the new bilingual Lines model trades a small held-out accuracy loss for faster full-file formatting on the pinned examples. ${formatComparison}. Its frozen held-out accuracy is **${pct(primary.typescript.accuracy)}% TS / ${pct(primary.rust.accuracy)}% Rust**, versus **${pct(control.typescript.accuracy)}% / ${pct(control.rust.accuracy)}%** for the original-trained cross-attention control.

## Bilingual original-source models — held-out test

One model trained from scratch on both Rust and TypeScript. Architecture and seed-42 primary were selected on validation and frozen before this one-shot evaluation; seed 123 is confirmation, not a replacement selected on test. All four models use identical admitted test boundaries: **${heldOut.results[heldOut.plan.primary].overall.examples.toLocaleString("en-US")}**, including **${primary.typescript.examples.toLocaleString("en-US")} TS** and **${primary.rust.examples.toLocaleString("en-US")} Rust**. One validation-calibrated threshold per model, with no test-time retuning.

| Model | TS accuracy | Rust accuracy | TS F1 | Rust F1 | TS log loss | Rust log loss |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${heldOutTable}

${(["accuracy", "f1", "logLoss"] as const)
  .map((metric) =>
    chart(
      `Original-source held-out ${metric}`,
      heldOutKeys.flatMap((_, i) => [
        `${shortNames[i]} TS`,
        `${shortNames[i]} Rust`,
      ]),
      metric === "logLoss"
        ? "Log loss (lower is better)"
        : "% (higher is better)",
      heldOutKeys.flatMap((key) =>
        ["typescript", "rust"].map((lang) =>
          Number(
            (
              heldOut.results[key].byLanguage[lang][metric] *
              (metric === "logLoss" ? 1 : 100)
            ).toFixed(metric === "logLoss" ? 5 : 2),
          ),
        ),
      ),
      metric === "logLoss" ? undefined : 100,
    ),
  )
  .join("\n\n")}

Selected Lines minus cross-attention: **${((primary.typescript.accuracy - control.typescript.accuracy) * 100).toFixed(2)} percentage points TS**, **${((primary.rust.accuracy - control.rust.accuracy) * 100).toFixed(2)} points Rust**. The speed/accuracy tradeoff must be judged using the full-file measurements below, not scoring-only throughput. [Frozen plan](benchmark-data/lines-mixed-v1/held-out-plan.json), [held-out results and paired correctness counts](benchmark-data/lines-mixed-v1/held-out.json), [training protocol](research/lines-mixed-v1.md).

## Earlier accuracy by language and label source

These are **corpus-specific trained checkpoints**, not one universal checkpoint evaluated against both styles. See checkpoint mapping below. Accuracy is binary blank-line agreement at admitted boundaries, not whole-file correctness.

| Model family | TS: Jev-prepared corpus — test | TS: original source — validation | Rust: original source — validation |
| --- | ---: | ---: | ---: |
| Lines | ${pct(old.accuracy)}% | ${pct(originalTs.accuracy)}% | ${pct(originalRs.accuracy)}% |
| Tree-Sitter cross-attention | **${pct(best.accuracy)}%** | **${pct(ts.accuracy)}%** | **${pct(rs.accuracy)}%** |

${chart(
  "Accuracy — higher is better",
  [
    "TS Jev Lines",
    "TS Jev Tree",
    "TS original Lines",
    "TS original Tree",
    "Rust original Lines",
    "Rust original Tree",
  ],
  "Accuracy (%)",
  [
    old.accuracy,
    best.accuracy,
    originalTs.accuracy,
    ts.accuracy,
    originalRs.accuracy,
    rs.accuracy,
  ].map((value) => Number(pct(value))),
  100,
)}

Chart labels use **Tree** for cross-attention; **Jev** and **original** identify the label source. Missing measurements are omitted, not plotted as zero.

| Model family | TS Jev test F1 | TS original validation F1 | Rust original validation F1 |
| --- | ---: | ---: | ---: |
| Lines | ${pct(old.f1)}% | ${pct(originalTs.f1)}% | ${pct(originalRs.f1)}% |
| Tree-Sitter cross-attention | ${pct(best.f1)}% | ${pct(ts.f1)}% | ${pct(rs.f1)}% |

${chart(
  "F1 — higher is better",
  [
    "TS Jev Lines",
    "TS Jev Tree",
    "TS original Lines",
    "TS original Tree",
    "Rust original Lines",
    "Rust original Tree",
  ],
  "F1 (%)",
  [old.f1, best.f1, originalTs.f1, ts.f1, originalRs.f1, rs.f1].map((value) =>
    Number(pct(value)),
  ),
  100,
)}

Earlier cross-attention advantages over language-specific Lines: **+${((ts.accuracy - originalTs.accuracy) * 100).toFixed(2)} percentage points TS**, **+${((rs.accuracy - originalRs.accuracy) * 100).toFixed(2)} points Rust**. Original-source figures in these two historical tables are validation results; the bilingual held-out comparison is above. Jev-trained models' scores on original-source labels, and original-trained models' scores on Jev labels, have not been measured here.

## CPU formatting performance and resource use

Measured with both the historical Jev-trained playground checkpoints and the **original-trained bilingual Lines and matched cross-attention control**. The bilingual Lines export is the frozen seed-42 checkpoint evaluated above, not the confirmation seed. All model/language combinations are rerun with the same runtime and inputs. Both original-trained models are available in the playground and published to R2.

| Model | Input language | LoC/sec ↑ | p95 file ms ↓ | CPU %¹ | CPU ms / 1k LoC ↓ | Peak RAM MiB² | Weights MiB |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${table}

${(
  [
    ["Formatting throughput — higher is faster", "LoC/sec", "locPerSecond", 0],
    ["p95 file latency — lower is faster", "Milliseconds", "p95Ms", 1],
    ["Process CPU utilization", "CPU (%)", "cpuPercent", 1],
    ["CPU work — lower is better", "CPU ms / 1k LoC", "cpuMsPerKloc", 1],
    ["Peak process RAM — lower is smaller", "MiB", "peakRssMiB", 1],
    ["Model weights — lower is smaller", "MiB", "weightsMiB", 2],
  ] as const
)
  .map(([title, unit, key, precision]) =>
    chart(
      title,
      results.map(
        (r) =>
          `${familyNames[r.family]} ${r.language === "rust" ? "Rust" : "TS"}`,
      ),
      unit,
      results.map((r) => Number(r[key].toFixed(precision))),
    ),
  )
  .join("\n\n")}

¹ Process CPU time divided by wall time: **100% = one fully occupied logical CPU**, and multi-threaded use can exceed 100%. Includes parser workers/native inference threads; excludes other machine processes. CPU ms/1k LoC measures total CPU work.

² Peak process RSS from process startup through the benchmark, including Node, TensorFlow, parser workers, model and temporary allocations. It is **not** model-only RAM or GPU VRAM. Separate subprocesses prevent previous models contaminating the peak. Raw results also record post-warmup RSS.

Original-trained matched full-file comparison: ${formatComparison}. Ratios above 1 mean Lines is faster; below 1 mean cross-attention is faster. These two short examples establish neither repository-wide throughput nor a universal speedup.

The new playground model is **Spacer Lines v1 Rust + TypeScript** (\`spacer-lines-mixed-1\`). Its release lives at \`spacer-models/models/lines-mixed-1/\`; [all five objects were read-back verified](benchmark-data/lines-mixed-v1/release-verification.json). PyTorch/TFJS export parity passed with maximum probability error 2.4×10⁻⁷, and both languages passed blank-line-only formatting checks.

Original-trained parameter payload sizes: Lines TS and Rust each **${((configs["lines-typescript"].parameters * 4) / 1048576).toFixed(2)} MiB**, mixed cross-attention **${((configs["cross-attention-mixed"].parameters * 4) / 1048576).toFixed(2)} MiB**, calculated as FP32 parameters × 4 bytes. Checkpoint/container overhead and optimizer state are excluded. Deployed weights sizes above are measured binary file sizes.


## CPU model scoring only — separate from formatting

Saved PyTorch FP32 results from the completed search: eight CPU threads, matched real validation inputs per language, one warm-up and 20 repeats, median throughput. Batch 1 uses 128 boundaries; batch 512 uses 8,192 boundaries. **Excludes parsing, tokenization and rendering; boundaries/sec is not LoC/sec.** The context-small candidate remains a validation-search result, not a test-selected deployment alternative.

| Model | TS batch 1 boundaries/s | Rust batch 1 boundaries/s | TS batch 512 boundaries/s | Rust batch 512 boundaries/s |
| --- | ---: | ---: | ---: | ---: |
${scoringKeys.map((key, i) => `| ${scoringNames[i]} | ${["typescript/batch1", "rust/batch1", "typescript/batch512", "rust/batch512"].map((k) => Math.round(scoring.metrics[key][k].boundariesPerSecond).toLocaleString("en-US")).join(" | ")} |`).join("\n")}

${[1, 512]
  .map((batch) =>
    chart(
      `CPU scoring — batch ${batch}`,
      scoringNames.flatMap((n) => [`${n} TS`, `${n} Rust`]),
      "Boundaries/sec",
      scoringKeys.flatMap((key) =>
        ["typescript", "rust"].map((lang) =>
          Math.round(
            scoring.metrics[key][`${lang}/batch${batch}`].boundariesPerSecond,
          ),
        ),
      ),
    ),
  )
  .join("\n\n")}

[All scoring timings](benchmark-data/lines-mixed-v1/performance.json). The roughly 7× batched PyTorch scoring advantage must not be presented as a 7× end-to-end formatting gain.

## Methodology and checkpoint mapping

- **Jev-prepared TS accuracy:** existing frozen evaluation on 722,143 identical test boundaries. Lines is the deployed historical model (threshold 0.41); Tree is cross-attention seed 42 (0.50). The stronger retrained Lines control scored 92.22%, versus Tree's 92.49%. No test reopening or calibration in this report.
- **Earlier original-source validation:** saved metrics on 2,739,595 TS and 1,283,192 Rust examples. The historical Lines row uses separate language-specific seed-42 models (thresholds 0.54 TS, 0.545 Rust); Tree uses one mixed TS/Rust seed-42 model (global threshold 0.52).
- **New bilingual held-out evaluation:** selected Lines seed 42 threshold 0.52, baseline 0.505, confirmation seed 123 threshold 0.515, original-trained Tree 0.52. All trained on the same mixed 19,454,891 boundaries. Checkpoints minimize validation loss; thresholds maximize validation accuracy with F1 tie-break. Architecture selection uses macro-language validation accuracy. The held-out evaluation is frozen, CPU FP32, resumable only with identical hashes, and cached separately from this report generator. No post-test selection or training.
- Both datasets use file-group splits targeting 70/15/15 and common model-comparison membership. Exact truncated lexical contexts are deduplicated train-first. Bundled grammars rejected 1,842 teacher source files and 12,306 original-source files; coverage is restricted to admitted inputs. The split is file-group based, not repository-disjoint.
- Teacher labels come from existing Jev-prepared after-states; original labels come from unchanged upstream whitespace. They measure different style targets. No new teacher calls, no self-generated Jev score, and no invented Rust teacher results.
- Tree is a **lexical–Tree-sitter hybrid**, combining BPE and compact syntax-ID streams with cross-attention. Lines is also token-based (line-wise BPE). The new bilingual Lines and original-trained Tree both see both languages; only the historical language-specific Lines controls see one language each. Neither blank lines nor language IDs enter the new Lines model.
- **Performance workload:** pinned shared playground excerpts: VS Code fuzzy scoring for TS, ripgrep processing for Rust. One file per language, ${results[0].lines} TS LoC and ${results[1].lines} Rust LoC after removing original spacing. These are a small illustrative workload, not a representative repository-wide speed estimate or accuracy dataset. Both models receive identical input per language.
- One warm-up and 20 measured sequential full-format runs per model/language. Throughput = total input LoC / total wall time; p95 is nearest-rank file latency. Includes Tree-sitter preparation, model tokenization/scoring, and syntax-checked rendering. Excludes model loading, file I/O and HTTP. No code reformatter runs.
- CPU runtime: TensorFlow.js Node 4.22.0; ${cpus()[0]?.model}; ${cpus().length} logical CPUs; Node ${process.version}. Default thread pools: intra 8, inter 2, OMP 8. Shared-machine activity can affect timings; GPU training performance is not being conflated with CPU inference.
- Historical deployed artifacts: \`tmp/spacer-lines-ts\` and \`tmp/spacer-tree-sitter-cross-attention-1\`. New bilingual export: \`tmp/spacer-lines-mixed-1\`, from \`tmp/lines-mixed-v1/context-dilated-seed42\`. Original-trained attention control export: \`tmp/spacer-tree-sitter-cross-attention-original-1\`. Source training checkpoints: \`tmp/research-v2-original-gpu/{lines-typescript,lines-rust,cross-attention-mixed}-seed42\`.

## Reproduce and approval boundary

\`\`\`sh
mise benchmark
\`\`\`

Requires the local model exports, saved evaluation/config files, and pinned example catalog. This command makes **no network/API calls** and does not train, recalibrate, or reopen test data. It preserves the previous report and timestamped raw metrics before replacing this document.

Raw results, input/model hashes, individual timings, and source metrics: [results.json](../${root}/results.json).

**Further evaluation:** full-file or corpus-wide Jev testing requires a separate budget. Rust corpus teacher labels do not currently exist. No paid testing starts from this benchmark task.

${jevReport}

### Economical Jev probe

Run \`mise run benchmark:jev\` for a network-free plan and reuse of stored results. It samples up to 16 evenly distributed boundaries from each of the same TS/Rust excerpts (32 questions, at most two requests). No warm-up or repeats. This is a boundary probe, **not full-file LoC/sec or corpus accuracy**; the tables above remain unchanged until comparable measurements exist.

The [plan](benchmark-data/jev/plan.json) lists exact prompts and estimated uncached tokens; [results](benchmark-data/jev/results.json) retains responses, provider token usage, model identity and original latency. See [cache methodology](benchmark-data/jev/README.md). These JSON files and future benchmark runs live in tracked \`docs/benchmark-data/\`, rather than ignored \`reports/\`.

Only after approval: \`mise run benchmark:jev -- --execute --model <approved-model> --max-estimated-tokens 16000\`. The estimate is a tokenizer proxy, not a provider-side hard cap. Retries are disabled; identical cached requests cost zero tokens. Adding local models does not invalidate Jev responses. The default alias is frozen by caching its first response; choose a new explicit model identifier to request a new model evaluation.
`;
  await writeFile(`${root}/benchmark.md`, markdown);
  await writeFile("docs/benchmark.md", markdown);
  console.log("Wrote docs/benchmark.md");
}
