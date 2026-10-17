import { useState } from "react";
import { examples } from "./examples/catalog.ts";

export type ExampleMode = "without" | "original" | "custom";
export function useExample() {
  const [exampleId, setExampleId] = useState(examples[0]!.id);
  const [mode, setMode] = useState<ExampleMode>("without");
  const [source, setSource] = useState(examples[0]!.withoutSpacing);
  const [filename, setFilename] = useState(examples[0]!.filename);
  const [custom, setCustom] = useState<{ source: string; filename: string; exampleId: string }>();
  const example = examples.find(e => e.id === exampleId)!;
  function selectExample(id: string, nextMode: Exclude<ExampleMode, "custom">) {
    const next = examples.find(e => e.id === id)!;
    setExampleId(id); setMode(nextMode); setFilename(next.filename);
    setSource(nextMode === "original" ? next.original : next.withoutSpacing);
  }
  function changeMode(next: ExampleMode) {
    if (next === "custom") {
      if (custom) { setSource(custom.source); setFilename(custom.filename); setExampleId(custom.exampleId); setMode(next); }
    } else selectExample(exampleId, next);
  }
  function edit(source: string, name = filename) {
    setSource(source); setFilename(name); setMode("custom");
    setCustom({source, filename: name, exampleId});
  }
  return { source, filename, mode, example, custom, changeMode,
    changeLanguage: (id: string) => selectExample(id, mode === "original" ? "original" : "without"),
    setSource: (source: string) => edit(source), setFilename: (name: string) => edit(source, name) };
}

export namespace ExampleControls {
  export interface Props { state: ReturnType<typeof useExample>; }
}
export const ExampleControls: React.FC<ExampleControls.Props> = props => {
  const { state } = props;
  return <section className="example-picker">
    <div className="example-selects">
      <label>Language<select aria-label="Example language" value={state.example.id} onChange={e => state.changeLanguage(e.target.value)}>
        {examples.map(example => <option key={example.id} value={example.id}>{example.label}</option>)}
      </select></label>
      <label>Source<select aria-label="Example spacing" value={state.mode} onChange={e => state.changeMode(e.target.value as ExampleMode)}>
        <option value="without">Example without original spacing</option>
        <option value="original">Example with original spacing</option>
        {state.custom && <option value="custom">Custom code</option>}
      </select></label>
    </div>
    {state.mode !== "custom" && <p><strong>{state.example.title}</strong> · {state.example.description}</p>}
    {state.mode === "custom" ? <p>Custom code · selecting an example mode restores the standard example. Your custom draft remains selectable.</p> : <p>
      <a href={state.example.url} target="_blank" rel="noreferrer">{state.example.repository} · {state.example.path}:{state.example.startLine}–{state.example.endLine}</a>
      {" · "}<a href={state.example.licenseUrl} target="_blank" rel="noreferrer">Upstream license</a>
      {" · "}{state.example.original.split("\n").length - 1} original lines
      {state.mode === "without" && ` · ${state.example.removedBlankLines} blank lines removed (literal/comment contents preserved)`}
      {state.example.wrapper && ` · ${state.example.wrapper}`}
    </p>}
  </section>;
};
