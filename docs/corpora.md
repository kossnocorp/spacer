# Managed corpora

All corpus snapshots live under `corpora/<corpus-id>/`, ignored by Git. Published
archives live in the `spacer-models` R2 bucket under `corpora/<corpus-id>/`.
Models live under `models/<release-prefix>/` (the existing prefix still omits
`spacer-`).

## Tasks

| Command                                                  | Purpose                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `mise run corpus:teacher`                                | Audit Jev completion and materialize the cleaned historical training corpus            |
| `mise run corpus:collect`                                | Resume the frozen top-100 TS and Rust repository collection                            |
| `mise run corpus:clean -- <source-id> --out-id <new-id>` | Produce an audited UTF-8-only successor without changing retained source bytes         |
| `mise run corpus:archive -- <id>`                        | Compress using pinned zipper, upload parts, verify remote bytes, publish manifest last |
| `mise run corpus:fetch -- <id>`                          | Download, verify, extract and verify every source hash; refuses existing destination   |
| `mise run models:migrate`                                | Copy old model prefixes, verify checksums, then remove old objects                     |

`mise install` installs `unxed/zipper` 0.1.178. Cloudflare access uses `fnox exec --`
and the configured No Corp account. Transport parts are 200 MiB, below the
Cloudflare object-upload endpoint's 300 MB limit. Transient failures retry four
times. Corpus README files accompany archives in the bucket.

## Corpus definitions

### `jev-typescript-ordered-v1`

83,097 admitted TypeScript-family files from 25 repositories. Every included file
has a successful Jev progress record, matching boundary count, and matching
corpus after-state SHA-256. `repos/` contains only admitted source files;
licenses, completion evidence, preparation code and the exact dataset live in
separate directories. The archive includes the existing file-group splits and
teacher labels. Archives use TAR/Zstandard: zipper's ZIP64 output failed
independent header validation on this corpus, so ZIP is not used for publication.
The published TAR/Zstandard archive is 611,129,343 bytes. A complete remote
download/extraction round trip verified every one of the 83,097 source hashes.

### `github-top100-typescript-2026-10-17-v1`

### `github-top100-rust-2026-10-17-v1`

Completed collection: **448,450 TypeScript-family files** and **129,510 Rust
files**, from 100 repositories per language. These are source counts before
parser admission and training-context deduplication.

Published TAR/Zstandard sizes: **735,862,631 bytes** for TypeScript and
**346,700,627 bytes** for Rust. Uploaded parts are downloaded again and checked
against SHA-256 before the archive manifest is published.
Both new corpora also passed complete remote download/extraction tests with
every source hash verified (448,450 TypeScript-family files; 129,510 Rust files).

For each primary language, select the 100 highest-starred non-fork, non-archived
GitHub repositories. Search is restricted to >1,000 stars to avoid GitHub's
incomplete-search timeout; selection requires 100 complete results. The entire
search response is saved before cloning. Each repository's exact commit, ranking
star count, licenses, paths and source hashes are retained. Checkouts are sparse,
with Git databases removed after materialization.

TypeScript includes `.ts`, `.tsx`, `.mts`, `.cts`; Rust includes `.rs`. Exclude
dependency/build directories named `node_modules`, `vendor`, `target`, `dist`,
`build`, `.next`, and symlinks. Tests and fixtures remain part of the snapshot;
syntax-incompatible files are reported separately by the training encoder.
Source bytes are unchanged: **no formatter and no Jev calls**. New labels reflect
upstream authors' original blank lines, not teacher judgments.

An `INCOMPLETE` marker prevents training/archiving unfinished snapshots. Original
spacing is removed from model inputs; labels are extracted separately at safe
Tree-sitter boundaries. Mixed-language training uses common membership and
file-group 70/15/15 splits; separate Lines runs filter by language.

## Active original-spacing training snapshots: v2

The v1 collections are preserved as source snapshots. Extension-only collection
also admitted MPEG transport streams using `.ts`, plus non-UTF-8/NUL-containing
fixtures. Audited v2 snapshots exclude these files without formatting any retained
source. Training now uses:

| Corpus                                   | Files retained | Exclusions |
| ---------------------------------------- | -------------: | ---------: |
| `github-top100-typescript-2026-10-17-v2` |        448,391 |         59 |
| `github-top100-rust-2026-10-17-v2`       |        129,500 |         10 |

Both v2 archives are published under their respective `corpora/<id>/` bucket
prefixes. Complete remote download/extraction tests verified all 448,391
TypeScript-family source hashes and all 129,500 Rust source hashes.

Each v2 corpus preserves all 100 repositories' provenance and lists excluded
paths, hashes and reasons in `excluded-binary.json`. Non-UTF-8 fixtures are an
explicit training eligibility exclusion, not a claim that every excluded fixture
was mislabeled source code.

```sh
mise run corpus:clean -- github-top100-typescript-2026-10-17-v1 --out-id github-top100-typescript-2026-10-17-v2
mise run corpus:clean -- github-top100-rust-2026-10-17-v1 --out-id github-top100-rust-2026-10-17-v2
```

The encoder verifies raw file bytes before decoding UTF-8, so binary content is
reported as an admission exclusion rather than a misleading hash mismatch.

See [the experiment plan](research/tree-sitter-v2.md) for training and evaluation.
