import { parentPort, workerData } from "node:worker_threads";
import {
  tokenize,
  prepareDocument,
  renderDocument,
  entityFor,
} from "./index.ts";
import { loadGrammar } from "./languages.ts";
const language = await loadGrammar(workerData.language, workerData.package);
parentPort!.on("message", async ({ id, action, args }) => {
  try {
    let value;
    if (action === "inspect") {
      const types = [];
      for (let i = 0; i < language.nodeTypeCount; i++) {
        const name = language.nodeTypeForId(i);
        if (name)
          types.push({
            name,
            named: language.nodeTypeIsNamed(i),
            entity: entityFor(name) ?? null,
          });
      }
      value = types;
    } else if (action === "tokenize")
      value = await tokenize(args[0], workerData.language);
    else if (action === "prepare")
      value = await prepareDocument(args[0], args[1], workerData.language, args[2]);
    else if (action === "render")
      value = await renderDocument(args[0], args[1], args[2]);
    else throw new Error(`Unknown action ${action}`);
    parentPort!.postMessage({ id, value });
  } catch (error) {
    parentPort!.postMessage({ id, error: String(error) });
  }
});
