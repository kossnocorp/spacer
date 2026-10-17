import { defineHandler, type InferProps } from "void";
import { modelTokenizers } from "../../../model/src/catalog.ts";

export const loader = defineHandler(c => ({
  view: Object.values(modelTokenizers).find(tokenizer => tokenizer.key === c.req.query("view"))?.key ?? "compact",
}));

export type Props = InferProps<typeof loader>;
