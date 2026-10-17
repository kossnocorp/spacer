import { useMemo, useState } from "react";
import { FileDiff } from "@pierre/diffs/react";
import { parseDiffFromFile } from "@pierre/diffs";
import { models } from "../../../model/src/catalog.ts";

export interface Result {
  source: string;
  filename: string;
  output: string;
  backend: string;
  model?: string;
  elapsedMs: number;
  boundaries: number;
}

const modelName = (id: string) =>
  models.find((model) => model.id === id)?.name ?? "Jev · API";

export namespace OutputPane {
  export interface Props {
    backend: string;
    index: number;
    backends: string[];
    results: Record<string, Result>;
    errors: Record<string, string>;
    busy: boolean;
    source: string;
    filename: string;
  }
}

export const OutputPane: React.FC<OutputPane.Props> = (props) => {
  const { backend, index, backends, results, errors, busy, source, filename } =
    props;
  const [requestedTab, setTab] = useState<"plain" | "diff" | "compare">(
    "plain",
  );
  const [comparison, setComparison] = useState("");
  const others = backends.filter((id) => id !== backend);
  const tab =
    requestedTab === "compare" && !others.length ? "diff" : requestedTab;
  const comparisonBackend = others.includes(comparison)
    ? comparison
    : others[0];
  const result = results[backend];
  const comparisonResult = comparisonBackend
    ? results[comparisonBackend]
    : undefined;
  const comparable =
    result &&
    comparisonResult &&
    result.source === comparisonResult.source &&
    result.filename === comparisonResult.filename;
  const baseline =
    tab === "compare"
      ? comparable
        ? comparisonResult.output
        : undefined
      : result?.source;
  const stale =
    result && (result.source !== source || result.filename !== filename);
  const diff = useMemo(
    () =>
      result && baseline !== undefined
        ? parseDiffFromFile(
            { name: result.filename, contents: baseline },
            { name: result.filename, contents: result.output },
          )
        : undefined,
    [result, baseline],
  );
  const views = [
    "plain",
    "diff",
    ...(others.length ? (["compare"] as const) : []),
  ] as const;
  return (
    <section className="pane output-pane" aria-label={modelName(backend)}>
      <div className="pane-header output-header">
        <h2>
          <span className="step">{String(index + 2).padStart(2, "0")}</span>
          {modelName(backend)}
        </h2>
        <div
          className="tabs"
          role="tablist"
          aria-label={`${modelName(backend)} output view`}
        >
          {views.map((view) => (
            <button
              key={view}
              role="tab"
              id={`${backend}-${view}-tab`}
              aria-selected={tab === view}
              aria-controls={`${backend}-${view}-panel`}
              onClick={() => setTab(view)}
            >
              {view === "plain"
                ? "Plain output"
                : view === "diff"
                  ? "Diff view"
                  : "Compare diff"}
            </button>
          ))}
        </div>
      </div>
      <div
        className="output-body"
        role="tabpanel"
        id={`${backend}-${tab}-panel`}
        aria-labelledby={`${backend}-${tab}-tab`}
      >
        {tab === "compare" && (
          <div className="output-controls">
            <label>
              Compare against{" "}
              <select
                value={comparisonBackend}
                onChange={(event) => setComparison(event.target.value)}
              >
                {others.map((id) => (
                  <option key={id} value={id}>
                    {modelName(id)}
                  </option>
                ))}
              </select>
            </label>
            <small>
              − {comparisonBackend && modelName(comparisonBackend)} · +{" "}
              {modelName(backend)}
            </small>
          </div>
        )}
        {!result ? (
          <div className="empty">
            <span className="empty-icon">↵</span>
            <h3>Good code deserves good spacing.</h3>
            <p>
              {errors[backend]
                ? "This model failed. Run again to retry."
                : busy
                  ? "This model is formatting…"
                  : "Your formatted code will appear here. Hit Format code to begin."}
            </p>
          </div>
        ) : tab === "plain" ? (
          <textarea
            className="code"
            aria-label={`${modelName(backend)} formatted output`}
            readOnly
            value={result.output}
            spellCheck={false}
          />
        ) : tab === "compare" && !comparable ? (
          <p className="unchanged">
            {comparisonBackend && errors[comparisonBackend]
              ? "The comparison model failed. Run again to retry."
              : busy
                ? "Waiting for the comparison model…"
                : "Run both models on the same input to compare their outputs."}
          </p>
        ) : (
          <div className="diff">
            {result.output === baseline && (
              <p className="unchanged">
                {tab === "compare"
                  ? "Both models produced identical output."
                  : "No changes — already looking good."}
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
          ? `${result.model || modelName(backend)} · ${Math.round(result.elapsedMs)} ms · ${result.boundaries} boundaries`
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
  );
};
