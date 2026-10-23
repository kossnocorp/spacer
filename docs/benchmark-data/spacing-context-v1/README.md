# Spacing-context v1 campaign

See [the frozen protocol](../../research/spacing-context-v1.md).

- `protocol.json`: corpus hashes and frozen implementation hashes, saved before encoding.
- `encoded-manifest.json`: completed encoding counts and provenance (written after encoding).
- `training.json`: completed GPU training history, configuration and weight hash.
- `sequential-plan.json`: deterministic validation sample and frozen threshold.
- `sequential-validation.json`: original/stripped-input top-to-bottom validation metrics.
- `complete.json`: written only when training, export checks and sequential validation finish.
- `release-verification.json`: SHA-256 and byte-for-byte bucket read-back verification.

## Deployment

The completed model is registered as `spacer-tree-sitter-spacing-context-1` in
the shared playground catalog. All five release objects are published under
`spacer-models/models/tree-sitter-spacing-context-1/`:
`release.json`, `config.json`, `export-check.json`, `best/model.json`, and
`best/weights.bin`. Deployment must download the runtime files into
`tmp/spacer-tree-sitter-spacing-context-1/` relative to the repository root.
Weights are runtime assets and are not bundled by Vite.

Deploy the updated inference code with the artifacts: `contextMode` in the config
selects `spacing-context-v1`, which hides the target gap and updates spacing
top-to-bottom. The older-model context checkbox does not override this contract.
Production build, TypeScript checks, export parity, and live TS/Rust API checks
with both checkbox settings passed. Interactive browser controls were not tested.

The benchmark generator now consumes the saved sequential validation results and
measures all five families using the playground's current all-safe-line boundary
coverage. Historical accuracy scopes remain distinct. No new Jev calls are made.

The campaign runs as user service `spacer-spacing-context-v1`; its persistent log
is `tmp/spacing-context-v1.log`. The service can survive closing a terminal, but
not necessarily logout/reboot. Training resumes at epoch boundaries via
`mise run research:spacing-context`. Interrupted encoding is detected rather than
silently reused. Preserve its incomplete directory before restarting encoding.

The GPU smoke test and target-gap invariance/sequential feedback tests passed
before launch. Smoke-test metrics are synthetic and are not accuracy evidence.
Do not confuse teacher-forced validation with sequential formatting accuracy.
The legacy test file groups have previously been evaluated by other campaigns;
this campaign does not open them for evaluation or claim a fresh held-out result.
