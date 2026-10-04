import { useState, useMemo } from "react";
import { FileDiff } from "@pierre/diffs/react";
import { parseDiffFromFile } from "@pierre/diffs";
import "./style.css";

const example = `interface User {
  name: string;
  active: boolean;
}
const users: User[] = [
  { name: "Ada", active: true },
  { name: "Linus", active: false },
];
function getActiveNames(users: User[]) {
  const active = users.filter((user) => user.active);
  return active.map((user) => user.name);
}
export const names = getActiveNames(users);
`;
interface Result {
  source: string;
  filename: string;
  output: string;
  backend: string;
  elapsedMs: number;
  boundaries: number;
}

export const Playground: React.FC = () => {
  const [source, setSource] = useState(example);
  const [filename, setFilename] = useState("example.ts");
  const [backend, setBackend] = useState("spacer");
  const [tab, setTab] = useState<"plain" | "diff">("plain");
  const [result, setResult] = useState<Result>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const diff = useMemo(
    () =>
      result
        ? parseDiffFromFile(
            { name: result.filename, contents: result.source },
            { name: result.filename, contents: result.output },
          )
        : undefined,
    [result],
  );
  const stale =
    result &&
    (source !== result.source ||
      filename !== result.filename ||
      backend !== result.backend);

  async function format() {
    setBusy(true);
    setError("");
    const input = { source, filename, backend };
    try {
      const response = await fetch("/api/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Formatting failed.");
      setResult({ ...input, ...data });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to reach the backend.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <title>Spacer playground</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <header className="masthead">
        <a href="/" className="brand">
          <span className="brand-icon">↕</span>spacer
          <span className="badge">PLAYGROUND</span>
        </a>
        <span className="tagline">A little space. A lot more clarity.</span>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">CODE, WITH ROOM TO BREATHE</p>
          <h1>Find your spacing.</h1>
          <p>Paste your code, choose a model, and see the difference.</p>
        </div>
        <span className="local-note">
          <i /> TypeScript & JavaScript
        </span>
      </section>
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
          <label>
            Backend
            <select
              value={backend}
              onChange={(e) => setBackend(e.target.value)}
            >
              <option value="spacer">Spacer · local model</option>
              <option value="jev">Jev · API</option>
            </select>
          </label>
          <button className="format-button" disabled={busy} onClick={format}>
            {busy ? "Formatting…" : "Format code"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="workspace" aria-busy={busy}>
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
        <section className="pane">
          <div className="pane-header">
            <h2>
              <span className="step">02</span>Output
            </h2>
            <div className="tabs" role="tablist" aria-label="Output view">
              <button
                role="tab"
                id="plain-tab"
                aria-selected={tab === "plain"}
                aria-controls="plain-panel"
                onClick={() => setTab("plain")}
              >
                Plain output
              </button>
              <button
                role="tab"
                id="diff-tab"
                aria-selected={tab === "diff"}
                aria-controls="diff-panel"
                onClick={() => setTab("diff")}
              >
                Diff view
              </button>
            </div>
          </div>
          <div
            className="output-body"
            role="tabpanel"
            id={`${tab}-panel`}
            aria-labelledby={`${tab}-tab`}
          >
            {!result ? (
              <div className="empty">
                <span className="empty-icon">↵</span>
                <h3>Good code deserves good spacing.</h3>
                <p>
                  Your formatted code will appear here.
                  <br />
                  Choose a backend and hit Format code.
                </p>
              </div>
            ) : tab === "plain" ? (
              <textarea
                className="code"
                aria-label="Formatted output"
                readOnly
                value={result.output}
                spellCheck={false}
              />
            ) : (
              <div className="diff">
                {result.output === result.source && (
                  <p className="unchanged">
                    No changes — already looking good.
                  </p>
                )}
                {diff && (
                  <FileDiff
                    fileDiff={diff}
                    options={{
                      diffStyle: "unified",
                      theme: "pierre-dark",
                      themeType: "dark",
                      overflow: "scroll",
                    }}
                  />
                )}
              </div>
            )}
          </div>
          <div className="pane-footer" role="status">
            {result
              ? `${result.backend === "spacer" ? "Spacer" : "Jev"} · ${Math.round(result.elapsedMs)} ms · ${result.boundaries} boundaries`
              : "Ready when you are"}
            <span>
              {stale
                ? "Input changed · run again"
                : result
                  ? "Formatting complete"
                  : "No output yet"}
            </span>
          </div>
        </section>
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
