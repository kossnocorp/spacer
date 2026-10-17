# Shared upstream examples

Both `/` and `/tokenizer` use `catalog.ts`. It contains 17 pinned, attributed
examples from actively maintained projects: VS Code, ripgrep, Requests, Go,
.NET runtime, Swift Argument Parser, OkHttp, Prettier, Neovim, Rails, Gson,
Symfony, LevelDB, Redis, Git, Elixir, and Zig.

Every entry includes its exact commit, source path, original line range, source
URL and license URL. Copies of upstream license material are in `licenses/`.
Zig uses release 0.14.1; Redis uses the maintained 7.2 branch.

Examples range from 155 to 476 lines. These are deliberately selected processing
pipelines and algorithms with nested control flow and meaningful internal phases,
rather than short utility methods, documentation samples, or repetitive fixtures.
No model predictions were used to select them. They are demonstrations, not a benchmark.

| Language | Implementation |
| --- | --- |
| TypeScript | VS Code fuzzy matching, score normalization and ranking tie-breaks |
| Rust | ripgrep's generic multiline-search impl, overlapping matches and context emission |
| Python | Requests redirects, authentication, cookies and body rewinding |
| Go | HTTP round trip, connection acquisition, cancellation and retry |
| C# | JSON document metadata construction and duplicate-property traversal |
| Swift | Argument parsing strategies, positional arguments and subcommands |
| Kotlin | OkHttp retry, redirects, resource cleanup and authentication |
| JavaScript | Prettier AST comment classification, attachment and tie resolution |
| Lua | Neovim LSP edit ordering, buffer mutation and confirmation |
| Ruby | Rails nested transactions, lazy materialization, commit and rollback |
| Java | Gson reflection, field adapters, generic resolution and accessibility |
| PHP | Symfony controller dispatch, events, responses and exception handling |
| C++ | LevelDB concurrent writer queue, batching, log sync and backpressure |
| C | Redis incremental command processing, pipelining and network reads |
| Bash | Git subtree ancestry checks, commit caching and history reconstruction |
| Elixir | Mix recursive dependency convergence, locking and conflict resolution |
| Zig | Filesystem deletion with bounded-stack traversal and race handling |

Larger files are represented by contiguous complete declaration excerpts.
Standalone wrappers (Go package, C#/Java classes) are recorded and displayed.
These are source-reading
examples, not self-contained executable programs; imports and surrounding
definitions may be absent. They are never executed by the playground.

`original` retains upstream spacing inside the excerpt. `withoutSpacing` removes
blank lines outside protected literals/comments; it never removes nonempty
lines. This avoids corrupting embedded strings or documentation. The source
selector starts in that mode. Editing source or filename creates a custom draft;
selecting an example mode restores the chosen language's standard example.

Only languages supported by our bundled Tree-sitter grammars are included.
SQL and Assembly are omitted.
