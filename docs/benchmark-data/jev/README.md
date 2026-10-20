# Economical Jev benchmark cache

`mise run benchmark:jev` is offline by default. It writes an exact request plan,
token estimate and aggregate results, reusing existing responses. No credentials
are stored. JSON here is intended to be committed with the benchmark.

The probe uses 16 evenly spaced admitted boundaries per language from the pinned
playground excerpts, five-line context and the production marked-boundary prompt.
It batches once per language, without warm-ups, repeats, or automatic retries.
This does not measure whole-file throughput or corpus accuracy.

Each immutable response filename is a SHA-256 hash of the methodology, source,
selected rows and exact request (including requested model and prompt). Changes
to any of those invalidate reuse; adding local models or changing report layout
does not. The formatter implementation hash is conservatively part of the key.
Provider-returned model ID and usage remain in the response. Mutable model aliases
reuse the original result: select a new explicit model to intentionally refresh.
Threshold-only reanalysis can use stored probabilities without paid calls, though
this CLI conservatively makes a new identity when its methodology changes.

After approval, `mise run benchmark:jev -- --execute --model <approved-model>`
executes only missing requests, sequentially. `TYPESAFE_API_KEY` is read from the
environment. `--max-estimated-tokens` defaults to 16000 and checks uncached work
before any calls. Estimates use cl100k_base on serialized requests plus 256 output
tokens per request; actual Jev token accounting can differ. This is not a hard
provider token or dollar cap.

Each response is saved atomically immediately after success. A `.pending` file
is created before sending; ambiguous failures retain it and block rebilling.
Review provider history before manually removing such a reservation. A `.lock`
prevents simultaneous invocations; after a process crash, verify it has stopped
before removing a stale lock. Never automatically delete these markers to retry.

`results.json` is a current-view index; hashed response JSON preserves historical
measurements even after methodology changes. Keep the cache in version control.
