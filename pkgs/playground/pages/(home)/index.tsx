import { useState } from "react";
import { OutputPane, type Result } from "./output-pane.tsx";
import "./style.css";
import { models, defaultModel } from "../../../model/src/catalog.ts";
import { ExampleControls, useExample } from "../../src/example-controls.tsx";
import { ResultCache, resultKey } from "../../src/result-cache.ts";
import "../../src/examples.css";

const modelOptions = [...models, { id: "jev", name: "Jev · API" }];
const modelName = (id: string) =>
  modelOptions.find((model) => model.id === id)?.name ?? id;

export const Playground: React.FC = () => {
  const exampleState = useExample();
  const { source, setSource, filename, setFilename } = exampleState;
  const [backends, setBackends] = useState([defaultModel]);
  const [jevApiKey, setJevApiKey] = useState("");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cache] = useState(() => new ResultCache<Result>());
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const busy = Object.values(pending).some(Boolean);

  async function format(targets = backends) {
    await Promise.all(
      targets.map(async (backend) => {
        const input = { source, filename, backend };
        const key = resultKey(source, filename, backend);
        setErrors((previous) => {
          const next = { ...previous };
          delete next[backend];
          return next;
        });
        const cached = cache.get(key);
        if (cached) {
          setResults((previous) => ({ ...previous, [backend]: cached }));
          return;
        }
        setPending((previous) => ({ ...previous, [backend]: true }));
        setResults((previous) => {
          const next = { ...previous };
          delete next[backend];
          return next;
        });
        try {
          const result = await cache.run(key, async () => {
            const response = await fetch("/api/format", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...input,
                ...(backend === "jev" && jevApiKey.trim()
                  ? { apiKey: jevApiKey.trim() }
                  : {}),
              }),
            });
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error ?? "Formatting failed.");
            return { ...input, ...data } as Result;
          });
          setResults((previous) => ({
            ...previous,
            [backend]: result,
          }));
        } catch (error) {
          setErrors((previous) => ({
            ...previous,
            [backend]:
              error instanceof Error
                ? error.message
                : "Unable to reach the backend.",
          }));
        } finally {
          setPending((previous) => ({ ...previous, [backend]: false }));
        }
      }),
    );
  }

  return (
    <main className={backends.length > 1 ? "multi-model" : undefined}>
      <title>Spacer playground</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <header className="masthead">
        <a href="/" className="brand">
          <span className="brand-icon">↕</span>spacer
          <span className="badge">PLAYGROUND</span>
        </a>
        <a href="/tokenizer" className="tagline">
          Explore tokenizers →
        </a>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">CODE, WITH ROOM TO BREATHE</p>
          <h1>Find your spacing.</h1>
          <p>Paste your code, choose a model, and see the difference.</p>
        </div>
        <span className="local-note">
          <i /> Tree-sitter: multiple languages · labels: TypeScript/TSX
        </span>
      </section>
      <ExampleControls state={exampleState} />
      <div className="toolbar">
        <label>
          Filename
          <input
            aria-label="Filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="actions">
          <div className="model-selectors">
            {backends.map((id, index) => (
              <div className="model-selector" key={index}>
                <label>
                  Model {backends.length > 1 ? index + 1 : ""}
                  <select
                    value={id}
                    disabled={busy}
                    onChange={(e) => {
                      const next = e.target.value;
                      setBackends((previous) =>
                        previous.map((value, i) =>
                          i === index ? next : value,
                        ),
                      );
                      if (Object.keys(results).length) void format([next]);
                    }}
                  >
                    {modelOptions.map((model) => (
                      <option
                        key={model.id}
                        value={model.id}
                        disabled={
                          model.id !== id && backends.includes(model.id)
                        }
                      >
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>
                {backends.length > 1 && (
                  <button
                    className="model-button"
                    disabled={busy}
                    aria-label={`Remove model ${index + 1}`}
                    onClick={() =>
                      setBackends((previous) =>
                        previous.filter((_, i) => i !== index),
                      )
                    }
                  >
                    −
                  </button>
                )}
                {index === backends.length - 1 && (
                  <button
                    className="model-button"
                    disabled={busy || backends.length >= 3}
                    aria-label="Add model"
                    title="Compare up to three models"
                    onClick={() => {
                      const next = modelOptions.find(
                        (model) => !backends.includes(model.id),
                      );
                      if (next && backends.length < 3) {
                        setBackends((previous) => [...previous, next.id]);
                        if (Object.keys(results).length) void format([next.id]);
                      }
                    }}
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            className="format-button"
            disabled={busy}
            onClick={() => void format()}
          >
            {busy ? "Formatting…" : "Format code"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <div className="model-descriptions">
        {backends.map((backend) => {
          const selectedModel = models.find((model) => model.id === backend);
          return (
            <section
              key={backend}
              className="model-description"
              aria-live="polite"
            >
              <strong>
                {models.find((m) => m.id === backend)?.name ?? "Jev · API"}
              </strong>
              <p>
                {models.find((m) => m.id === backend)?.description ??
                  "Hosted TypeSafe decision model (jev-latest). Scores blank-line placement for all supported languages without rewriting your code."}
              </p>
              {selectedModel && (
                <p>
                  <strong>Tokenizer:</strong> {selectedModel.tokenizer.label}
                  {" · "}
                  <a href={`/tokenizer?view=${selectedModel.tokenizer.key}`}>
                    Explore this tokenizer →
                  </a>
                </p>
              )}
              {backend === "jev" && (
                <div className="jev-credentials">
                  <label htmlFor="jev-api-key">Jev API key</label>
                  <input
                    id="jev-api-key"
                    type="password"
                    value={jevApiKey}
                    onChange={(event) => setJevApiKey(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={4096}
                    placeholder="Optional if TYPESAFE_API_KEY is set on the server"
                  />
                  <small>
                    Kept in page memory only; sent to the playground server for
                    this request. Leave empty to use the server key supplied by
                    fnox.
                  </small>
                </div>
              )}
              <small>
                {backend}
                {backend !== "jev" &&
                  ` · R2: spacer-models/models/${backend.replace(/^spacer-/, "")}/`}
              </small>
            </section>
          );
        })}
      </div>
      {Object.entries(errors)
        .filter(([id]) => backends.includes(id))
        .map(([id, error]) => (
          <div key={id} className="error" role="alert">
            {modelName(id)}: {error}
          </div>
        ))}
      <div
        className={`workspace workspace-${backends.length}`}
        aria-busy={busy}
      >
        <section className="pane">
          <div className="pane-header">
            <h2>
              <span className="step">01</span>Input
            </h2>
            <span className="pane-hint">Editable source</span>
          </div>
          <textarea
            className="code input"
            aria-label="Input code"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
          />
          <div className="pane-footer">
            {new TextEncoder().encode(source).length.toLocaleString()} bytes
            <span>
              {source
                ? source.split("\n").length - Number(source.endsWith("\n"))
                : 0}{" "}
              lines
            </span>
          </div>
        </section>
        {backends.map((backend, index) => (
          <OutputPane
            key={backend}
            backend={backend}
            index={index}
            backends={backends}
            results={results}
            errors={errors}
            busy={busy}
            source={source}
            filename={filename}
          />
        ))}
      </div>
      <footer>
        <span>oxfmt normalization + model-guided blank lines</span>
        <span>
          Diffs powered by <a href="https://diffs.com/">Pierre</a>
        </span>
      </footer>
    </main>
  );
};
export default Playground;
