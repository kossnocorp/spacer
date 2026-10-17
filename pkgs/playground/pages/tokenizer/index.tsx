import { useRef, useState } from "react";
import type { inspectTokenizers } from "../../../model/src/inspect-tokenizers.ts";
import "./style.css";
import { ExampleControls, useExample } from "../../src/example-controls.tsx";
import "../../src/examples.css";
import type { Props } from "./index.server.ts";

type Result = Awaited<ReturnType<typeof inspectTokenizers>>;
type Token = Result["views"][number]["tokens"][number];
// Multiplicative hashing gives each numeric token a stable hue in every view.
const color = (id: number) =>
  `hsl(${(Math.imul(id + 1, 2654435761) >>> 0) % 360} 65% 78%)`;
const explanations: Record<
  string,
  { title: string; text: string; models: string }
> = {
  bpe: {
    title: "Spacer Lines · line-wise BPE tokenizer",
    text: "Reads source text directly, without Tree-sitter. cl100k_base (gpt-tokenizer 3.4.0) splits each line into learned text pieces, retaining identifier spelling, punctuation, literal contents and line endings. The view takes five nonempty lines per side, keeps the nearest tokens and pads unused slots. Source is inspected as supplied, without oxfmt normalization.",
    models: "Used by Spacer Lines v1 TypeScript.",
  },
  bytes: {
    title: "Spacer Tree-Sitter · identifier-byte tokenizer (schema 1)",
    text: "Tree-sitter parses the source into a syntax tree. We walk that tree and map language-specific nodes to shared entities such as FUNCTION, CALL and RETURN. Blocks receive opening/closing markers; literal values and comments collapse to generic tokens. Each normalized identifier is emitted as IDENTIFIER, one token per UTF-8 byte, and IDENTIFIER_END. Repeated names repeat every byte. The nearest tokens around the gap are retained; truncation can cut through a name.",
    models:
      "Used by Bytes, Bytes Long, Bytes Wide, Contextual, Regularized Seed42/123/2026, and Ensemble v1 models.",
  },
  compact: {
    title: "Spacer Tree-Sitter · compact-ID tokenizer (schema 2)",
    text: "Uses the same Tree-sitter syntax entities, but replaces each complete identifier with two tokens: IDENTIFIER + local ID. After selecting an atomic context window, a shared map assigns IDs in source order across both sides of the gap. Repeated normalized names reuse the same ID; the map appears on the right. Names no longer consume one token per byte. IDs indicate normalized spelling equality, not resolved variable bindings or scope; shadowed variables can share an ID.",
    models:
      "Used by Spacer Tree-Sitter Compact v1. All tree models were trained on TypeScript/TSX labels; grammar support is not proof of cross-language formatting quality.",
  },
};

export const Tokenizer: React.FC<Props> = props => {
  const exampleState = useExample();
  const { source, setSource, filename, setFilename } = exampleState;
  const [requestedBoundary, setBoundary] = useState(25);
  const boundary = Math.min(requestedBoundary, source.split("\n").length);
  const [length, setLength] = useState(128);
  const [result, setResult] = useState<Result>();
  const [viewKey, setViewKey] = useState<string>(props.view);
  const [hover, setHover] = useState<Token>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const backdrop = useRef<HTMLPreElement>(null);
  const view = result?.views.find((v) => v.key === viewKey);
  const stale =
    !!result &&
    (source !== result.source ||
      filename !== result.filename ||
      boundary !== result.boundary ||
      length !== result.tokensPerSide);
  const active = stale ? undefined : hover;
  const start = active?.start,
    end = active?.end;
  const inspect = async () => {
    setBusy(true);
    setError("");
    setHover(undefined);
    try {
      const response = await fetch("/api/tokenize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, filename, boundary, length }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="tokenizer-page">
      <title>Tokenizer inspector · Spacer</title>
      <header>
        <a href="/">↕ spacer</a>
        <span>TOKENIZER INSPECTOR</span>
      </header>
      <h1>See what the model sees.</h1>
      <p>
        Compare text, syntax bytes, and compact identifier relationships. Hover
        or focus a token to locate it in the source.
      </p>
      <div className="tokenizer-controls">
        <ExampleControls state={exampleState} />
        <label>
          Filename
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          />
        </label>
        <label>
          Gap after line
          <input
            type="number"
            min={0}
            max={source.split("\n").length}
            value={boundary}
            onChange={(e) => setBoundary(Number(e.target.value))}
          />
        </label>
        <label>
          Tokens per side
          <input
            type="number"
            min={1}
            max={256}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
          />
        </label>
        <button onClick={inspect} disabled={busy}>
          {busy ? "Tokenizing…" : "Inspect tokens"}
        </button>
      </div>
      {error && (
        <p role="alert" className="tokenizer-error">
          {error}
        </p>
      )}
      {stale && (
        <p role="status">
          Input changed. Inspect again to refresh tokens and source mapping.
        </p>
      )}
      <div className="tokenizer-layout">
        <section className="tokenizer-main">
          <h2>
            Source{" "}
            <small>
              {source.split("\n").length} lines · gap after line {boundary}
            </small>
          </h2>
          <div className="tokenizer-editor">
            <pre ref={backdrop} aria-hidden="true">
              {start !== undefined && end !== undefined ? (
                <>
                  {source.slice(0, start)}
                  <mark>{source.slice(start, end)}</mark>
                  {source.slice(end)}
                </>
              ) : (
                source
              )}
              {"\n"}
            </pre>
            <textarea
              aria-label="Source code"
              wrap="off"
              spellCheck={false}
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setHover(undefined);
              }}
              onScroll={(e) => {
                if (backdrop.current) {
                  backdrop.current.scrollTop = e.currentTarget.scrollTop;
                  backdrop.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
            />
          </div>
          <nav aria-label="Tokenizer views">
            {[
              ["compact", "Tree-Sitter · Compact IDs"],
              ["bytes", "Tree-Sitter · Identifier bytes"],
              ["bpe", "Lines · BPE text"],
            ].map(([key, title]) => (
              <button
                key={key}
                aria-pressed={viewKey === key}
                onClick={() => {
                  setViewKey(key!);
                  setHover(undefined);
                }}
              >
                {title}
              </button>
            ))}
          </nav>
          <section className="tokenizer-explanation" aria-live="polite">
            <h2>{explanations[viewKey]!.title}</h2>
            <p>{explanations[viewKey]!.text}</p>
            <p>
              <strong>{explanations[viewKey]!.models}</strong>
            </p>
          </section>
          {!result && (
            <p className="tokenizer-empty">
              Choose a gap and click Inspect tokens to explore the model input.
            </p>
          )}
          {view && (
            <>
              <h2>
                {view.title}{" "}
                <small>
                  {view.tokens.filter((t) => t.id !== 0).length} non-padding /{" "}
                  {view.tokens.length} slots
                </small>
              </h2>
              {[0, 1].map((side) => (
                <div key={side} className="tokenizer-half">
                  <h3>{side === 0 ? "Before the gap →" : "→ After the gap"}</h3>
                  <div className="tokenizer-tokens">
                    {view.tokens
                      .slice(
                        side * result!.tokensPerSide,
                        (side + 1) * result!.tokensPerSide,
                      )
                      .map((t) => (
                        <button
                          key={t.position}
                          className={`tokenizer-token ${t.id === 0 ? "padding" : ""}`}
                          style={{ background: color(t.id) }}
                          title={`Slot ${t.position} · token ${t.id} · ${t.label}`}
                          onMouseEnter={() => setHover(t)}
                          onMouseLeave={() => setHover(undefined)}
                          onFocus={() => setHover(t)}
                          onBlur={() => setHover(undefined)}
                        >
                          <span>
                            {t.label
                              .replaceAll("\n", "↵")
                              .replaceAll("\t", "⇥")
                              .replaceAll(" ", "·")}
                          </span>
                          <small>{t.id}</small>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
        <aside>
          <h2>Metadata</h2>
          {result ? (
            <>
              <p>
                <strong>{result.language}</strong> · schema{" "}
                {view?.metadata && "schema" in view.metadata
                  ? String(view.metadata.schema)
                  : "BPE"}
              </p>
              <h3>Selected token</h3>
              <pre>
                {hover
                  ? JSON.stringify(hover, null, 2)
                  : "Hover or focus a token"}
              </pre>
              <h3>Compact identifier map</h3>
              <p>
                Shared across both halves; local IDs are assigned in source
                order after truncation.
              </p>
              {result.identities.map((identity) => (
                <details key={identity.id}>
                  <summary>
                    <span
                      className="tokenizer-dot"
                      style={{ background: color(identity.id) }}
                    />
                    ID_{identity.id - 256} ·{" "}
                    {identity.name || "(empty normalized name)"}{" "}
                    <small>#{identity.id}</small>
                  </summary>
                  <pre>{JSON.stringify(identity, null, 2)}</pre>
                </details>
              ))}
              <h3>Encoding configuration</h3>
              <pre>{JSON.stringify(view?.metadata, null, 2)}</pre>
              <h3>Reading this view</h3>
              <ul>
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              Token ranges, identifier mappings, and encoding configuration
              appear here.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
};
export default Tokenizer;
