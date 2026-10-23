import { createHash } from "node:crypto";
import { isMainThread } from "node:worker_threads";
import { request } from "./pool.ts";
export { closeParsers } from "./pool.ts";
import type { Node } from "web-tree-sitter";
import { parse, languageFor, flag } from "./languages.ts";
export {
  languages,
  grammars,
  grammarPackages,
  languageFor,
  loadGrammar,
} from "./languages.ts";

// IDs are a versioned serialization format. Never reorder without changing schema.
export const entities = [
  "PAD",
  "UNKNOWN",
  "FUNCTION",
  "CLASS",
  "LOOP",
  "IF",
  "ELSE",
  "RETURN",
  "IMPORT",
  "DECLARE",
  "ASSIGN",
  "CALL",
  "BLOCK_OPEN",
  "BLOCK_CLOSE",
  "IDENTIFIER",
  "IDENTIFIER_END",
  "STRING",
  "NUMBER",
  "BOOLEAN",
  "NULL",
  "COMMENT",
  "TRY",
  "CATCH",
  "THROW",
  "BREAK",
  "CONTINUE",
  "AWAIT",
  "YIELD",
  "MATCH",
  "TYPE",
  "PARAMETERS",
  "ARGUMENTS",
  "MEMBER",
  "ADD",
  "SUBTRACT",
  "MULTIPLY",
  "DIVIDE",
  "COMPARE",
  "AND",
  "OR",
  "NOT",
  "IN",
  "EXPORT",
  "ARRAY",
  "OBJECT",
  "INDEX",
  "DECORATOR",
] as const;
export type Entity = (typeof entities)[number];
export const token = Object.fromEntries(
  entities.map((name, i) => [name, i]),
) as Record<Entity, number>;
export const IDENTIFIER_BASE = 256;
export const legacyTokenizerInfo = {
  name: "spacer-tree-sitter",
  schema: 1,
  vocabulary: 512,
  pad: 0,
  entities: [...entities],
  identifierBase: IDENTIFIER_BASE,
  identifierEncoding:
    "normalized UTF-8 bytes + 256, delimited by IDENTIFIER/IDENTIFIER_END",
  grammars: ["tree-sitter-wasms@0.1.13", "@repomix/tree-sitter-wasms@0.1.17"],
};
export const tokenizerInfo = {
  ...legacyTokenizerInfo,
  schema: 2,
  identifierEncoding:
    "IDENTIFIER + boundary-local ID 256..511; normalized spelling equality; shared before/after map in source order; atomic truncation",
};
export function normalizeIdentifier(name: string) {
  return name
    .normalize("NFKC")
    .replace(/([\p{Lu}]+)([\p{Lu}][\p{Ll}])/gu, "$1_$2")
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, "$1_$2")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}
export function identifierTokens(name: string) {
  return [...Buffer.from(normalizeIdentifier(name), "utf8")].map(
    (b) => IDENTIFIER_BASE + b,
  );
}

const kinds: Record<string, Entity> = Object.create(null);
function aliases(entity: Entity, types: string) {
  for (const type of types.split(" ")) kinds[type] = entity;
}
aliases(
  "LOOP",
  "for_statement for_in_statement for_expression for_each_statement foreach_statement foreach loop_expression while_statement while_expression do_statement do_while_statement repeat_statement numeric_for_statement generic_for_statement for_in_clause for_clause enhanced_for_statement for_range_loop for range_based_for_statement foreach_loop for_loop while_loop",
);
aliases(
  "FUNCTION",
  "function_declaration function_definition function_item method_declaration method_definition function_expression arrow_function lambda lambda_expression local_function_statement function_decl function fun_decl function_declarator anonymous_function function_body_definition method singleton_method function_signature",
);
aliases(
  "CLASS",
  "class_declaration class_definition class_specifier struct_item struct_specifier struct_declaration interface_declaration trait_item enum_item enum_declaration implementation_definition impl_item module_definition",
);
aliases(
  "IF",
  "if_statement if_expression if conditional_expression conditional_statement",
);
aliases("ELSE", "else_clause else if_alternative");
aliases("RETURN", "return_statement return_expression return");
aliases(
  "IMPORT",
  "import_statement import_declaration import_from_statement use_declaration package_clause include_directive preproc_include using_directive import_header",
);
aliases(
  "DECLARE",
  "lexical_declaration variable_declaration local_variable_declaration let_declaration const_declaration var_declaration local_declaration property_declaration declaration val_definition",
);
aliases(
  "ASSIGN",
  "assignment assignment_expression augmented_assignment assignment_statement short_var_declaration variable_declarator init_declarator",
);
aliases(
  "CALL",
  "call call_expression function_call invocation_expression method_invocation macro_invocation application_expression",
);
aliases(
  "PARAMETERS",
  "formal_parameters parameters parameter_list lambda_parameters function_value_parameters",
);
aliases("ARGUMENTS", "arguments argument_list value_arguments");
aliases(
  "MEMBER",
  "member_expression field_expression attribute member_access_expression navigation_expression",
);
aliases("TRY", "try_statement try_expression try");
aliases("CATCH", "catch_clause except_clause catch_block rescue");
aliases("THROW", "throw_statement raise_statement throw_expression");
aliases(
  "MATCH",
  "match_expression match_statement switch_statement switch_expression when_expression case_expression",
);
aliases(
  "ARRAY",
  "array array_expression list list_expression array_creation_expression slice_literal",
);
aliases(
  "OBJECT",
  "object object_creation_expression dictionary dictionary_expression map_literal",
);
aliases(
  "INDEX",
  "subscript subscript_expression index_expression element_access_expression",
);
aliases("DECORATOR", "decorator annotation attribute_item");
const blocks = new Set(
  "block statement_block compound_statement class_body declaration_list function_body constructor_body body_statement do_block statements".split(
    " ",
  ),
);
const keywords: Record<string, Entity> = {
  for: "LOOP",
  foreach: "LOOP",
  while: "LOOP",
  if: "IF",
  elif: "ELSE",
  else: "ELSE",
  return: "RETURN",
  break: "BREAK",
  continue: "CONTINUE",
  await: "AWAIT",
  yield: "YIELD",
  throw: "THROW",
  raise: "THROW",
  import: "IMPORT",
  export: "EXPORT",
  in: "IN",
  of: "IN",
  and: "AND",
  "&&": "AND",
  or: "OR",
  "||": "OR",
  not: "NOT",
  "!": "NOT",
  "+": "ADD",
  "-": "SUBTRACT",
  "*": "MULTIPLY",
  "/": "DIVIDE",
  "=": "ASSIGN",
  ":=": "ASSIGN",
  "==": "COMPARE",
  "===": "COMPARE",
  "!=": "COMPARE",
  "!==": "COMPARE",
  "<": "COMPARE",
  ">": "COMPARE",
  "<=": "COMPARE",
  ">=": "COMPARE",
};
export function entityFor(type: string): Entity | undefined {
  return kinds[type];
}
export function isProtected(type: string) {
  return /comment|string|template|heredoc|regex|regular_expression|char_literal|character_literal|jsx_text|text|preproc/.test(
    type,
  );
}
const identifier =
  /identifier|property_identifier|field_identifier|type_identifier|constant|symbol|simple_identifier|variable_name|name$/;
export interface Event {
  id: number;
  row: number;
  start?: number;
  end?: number;
}
export function eventsFor(root: Node, language?: string): Event[] {
  const events: Event[] = [];
  const emit = (id: number, node: Node, end = false) =>
    events.push({
      id,
      row: end ? node.endPosition.row : node.startPosition.row,
      start: node.startIndex,
      end: node.endIndex,
    });
  function visit(node: Node) {
    const type = node.type;
    if (/comment/.test(type)) {
      emit(token.COMMENT, node);
      return;
    }
    if (
      /string|heredoc|regex|regular_expression|char_literal|character_literal|^template_(string|literal)$/.test(
        type,
      )
    ) {
      emit(token.STRING, node);
      return;
    }
    if (
      /^(integer|float|number|decimal|hex|octal|binary|nat_number).*|numeric_literal|number_literal/.test(
        type,
      )
    ) {
      emit(token.NUMBER, node);
      return;
    }
    if (/^(true|false|boolean|boolean_literal)$/.test(type)) {
      emit(token.BOOLEAN, node);
      return;
    }
    if (/^(null|null_literal|none|nil)$/.test(type)) {
      emit(token.NULL, node);
      return;
    }
    if (
      flag(node, "isNamed") &&
      identifier.test(type) &&
      !node.namedChildCount
    ) {
      emit(token.IDENTIFIER, node);
      for (const id of identifierTokens(node.text)) emit(id, node);
      emit(token.IDENTIFIER_END, node);
      return;
    }
    // Ruby's standard iterator syntax is represented as a call with a block.
    const iterator =
      language === "ruby" &&
      type === "call" &&
      node.childForFieldName("receiver") &&
      node.childForFieldName("method")?.text === "each" &&
      node.childForFieldName("block");
    const entity = iterator ? "LOOP" : entityFor(type);
    if (entity) emit(token[entity], node);
    const block = blocks.has(type);
    if (block) emit(token.BLOCK_OPEN, node);
    if (!node.childCount && !entity) {
      // Keywords are resolved by grammar type, never by an identifier's spelling.
      const kind = Object.hasOwn(keywords, type) ? keywords[type] : undefined;
      if (kind && kinds[node.parent?.type ?? ""] !== kind)
        emit(token[kind], node);
      else if (flag(node, "isNamed")) emit(token.UNKNOWN, node);
    }
    for (const child of node.children) if (child) visit(child);
    if (block) emit(token.BLOCK_CLOSE, node, true);
  }
  visit(root);
  return events.sort((a, b) => a.row - b.row);
}
export async function tokenize(
  source: string,
  language: string,
): Promise<Event[]> {
  if (isMainThread) return request(language, "tokenize", [source]);
  const tree = await parse(source, language);
  try {
    if (flag(tree.rootNode, "hasError"))
      throw new Error(`Invalid ${language} syntax`);
    return eventsFor(tree.rootNode, language);
  } finally {
    tree.delete();
  }
}
export function encodeLegacyContext(events: Event[], boundary: number, length = 128) {
  let low = 0,
    high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle].row < boundary) low = middle + 1;
    else high = middle;
  }
  const before = events.slice(Math.max(0, low - length), low).map((e) => e.id);
  const after = events.slice(low, low + length).map((e) => e.id);
  const values = new Int32Array(length * 2);
  values.set(before, length - before.length);
  values.set(after, length);
  return values;
}

type ContextUnit = { row: number; tokens: number[]; name?: string; start?: number; end?: number };
export interface InspectedToken {
  id: number;
  position: number;
  start?: number;
  end?: number;
  name?: string;
}
const contextUnits = new WeakMap<Event[], ContextUnit[]>();

// Keep the parser event stream compatible with schema 1. Collapse names once
// per document, before taking windows, so no window can split an identifier.
function unitsFor(events: Event[]) {
  const cached = contextUnits.get(events);
  if (cached) return cached;
  const units: ContextUnit[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    if (event.id !== token.IDENTIFIER) {
      units.push({ ...event, tokens: [event.id] });
      continue;
    }
    const bytes: number[] = [];
    while (++i < events.length && events[i]!.id !== token.IDENTIFIER_END) {
      const id = events[i]!.id;
      if (id < IDENTIFIER_BASE || id >= 512)
        throw new Error("Malformed identifier event sequence");
      bytes.push(id - IDENTIFIER_BASE);
    }
    if (i === events.length) throw new Error("Unterminated identifier event sequence");
    units.push({ ...event, tokens: [token.IDENTIFIER, 0], name: Buffer.from(bytes).toString("utf8") });
  }
  contextUnits.set(events, units);
  return units;
}

export function encodeContext(events: Event[], boundary: number, length = 128,
  inspect?: (token: InspectedToken) => void) {
  // At most length distinct two-token identifiers fit in both halves combined.
  // Reject unsupported budgets instead of silently aliasing identifiers.
  if (!Number.isSafeInteger(length) || length < 1 || length > 256)
    throw new Error("Compact context tokens per side must be between 1 and 256");
  const units = unitsFor(events);
  let low = 0, high = units.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (units[middle]!.row < boundary) low = middle + 1;
    else high = middle;
  }
  let start = low, end = low, leftSize = 0, rightSize = 0;
  while (start > 0 && leftSize + units[start - 1]!.tokens.length <= length)
    leftSize += units[--start]!.tokens.length;
  while (end < units.length && rightSize + units[end]!.tokens.length <= length)
    rightSize += units[end++]!.tokens.length;
  const names = new Map<string, number>();
  const values = new Int32Array(length * 2);
  let position = length - leftSize;
  for (let i = start; i < end; i++) {
    if (i === low) position = length;
    const unit = units[i]!;
    const put = (id: number) => {
      inspect?.({ id, position, start: unit.start, end: unit.end, name: unit.name });
      values[position++] = id;
    };
    if (unit.name === undefined) put(unit.tokens[0]!);
    else {
      let id = names.get(unit.name);
      if (id === undefined) {
        id = IDENTIFIER_BASE + names.size;
        names.set(unit.name, id);
      }
      put(token.IDENTIFIER);
      put(id);
    }
  }
  return values;
}

const containers = new Set([
  "program",
  "module",
  "source_file",
  "translation_unit",
  "compilation_unit",
  "class_body",
  "declaration_list",
  "statement_list",
  "body",
  ...blocks,
]);
const isComment = (node: Node) => /comment/.test(node.type);
const forbiddenNext =
  /^(else|elif|catch|finally|except|rescue|ensure|case|default)/;
export interface Boundary {
  row: number;
  from: number;
  to: number;
  existing: boolean;
}
export interface Document {
  preserveBlankLines?: boolean;
  source: string;
  language: string;
  lines: string[];
  boundaries: Boundary[];
  events: Event[];
  fingerprint: string;
  newline: string;
  finalNewline: boolean;
}
function fingerprint(root: Node) {
  const hash = createHash("sha256");
  function visit(n: Node) {
    hash.update(n.type + "\0");
    if (!n.childCount) hash.update(n.text + "\0");
    for (const c of n.children) if (c) visit(c);
  }
  visit(root);
  return hash.digest("hex");
}
export async function prepareDocument(
  source: string,
  filename: string,
  language = languageFor(filename),
  allLines = false,
): Promise<Document> {
  if (!language) throw new Error(`Unsupported file: ${filename}`);
  if (isMainThread) return request(language, "prepare", [source, filename, allLines]);
  const tree = await parse(source, language);
  try {
    if (flag(tree.rootNode, "hasError"))
      throw new Error(`Invalid ${language} syntax: ${filename}`);
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    const lines = source.split(/\r?\n/),
      candidates = new Map<number, Boundary>();
    const finalNewline = source.endsWith("\n");
    if (finalNewline) lines.pop();
    function visit(node: Node) {
      // Never adjust whitespace inside literals, comments, preprocessor directives or embedded markup.
      if (
        isProtected(node.type) ||
        /jsx|html|element|attribute|decorated_definition/.test(node.type)
      )
        return;
      if (containers.has(node.type)) {
        const children = node.namedChildren.filter(
          (n): n is Node => n !== null && !flag(n, "isMissing"),
        );
        for (let i = 1; i < children.length; i++) {
          const previous = children[i - 1],
            next = children[i];
          if (isComment(previous) || forbiddenNext.test(next.type)) continue;
          // Only complete sibling statements/declarations, never object properties or argument lists.
          if (
            !(
              isComment(next) ||
              /statement|declaration|definition|expression|item|function|class|method|assignment|import|export/.test(
                next.type,
              )
            )
          )
            continue;
          const end = previous.endPosition.row,
            row = next.startPosition.row;
          if (row <= end) continue;
          if (lines.slice(end + 1, row).some((line) => line.trim())) continue;
          if (lines[row].slice(0, next.startPosition.column).trim()) continue;
          candidates.set(row, {
            row,
            from: end + 1,
            to: row,
            existing: row > end + 1,
          });
        }
      }
      for (const child of node.namedChildren) if (child) visit(child);
    }
    visit(tree.rootNode);
    if (allLines) {
      candidates.clear();
      const protectedRows = new Set<number>();
      function protect(node: Node) {
        if (isProtected(node.type) || /jsx|html|element|attribute/.test(node.type) || !node.childCount) {
          for (let row = node.startPosition.row + 1; row <= node.endPosition.row; row++) protectedRows.add(row);
          return;
        }
        for (const child of node.children) if (child) protect(child);
      }
      protect(tree.rootNode);
      let previous = -1;
      for (let row = 0; row < lines.length; row++) {
        if (!lines[row].trim()) continue;
        if (previous >= 0) {
          let safe = true;
          for (let gap = previous + 1; gap <= row; gap++) {
            if (protectedRows.has(gap) || lines[previous].trimEnd().endsWith("\\")) safe = false;
          }
          if (safe) candidates.set(row, { row, from: previous + 1, to: row, existing: row > previous + 1 });
        }
        previous = row;
      }
    }
    return {
      source,
      language,
      lines,
      boundaries: [...candidates.values()].sort((a, b) => a.row - b.row),
      events: eventsFor(tree.rootNode, language),
      fingerprint: fingerprint(tree.rootNode),
      newline,
      finalNewline,
    };
  } finally {
    tree.delete();
  }
}
export async function renderDocument(
  document: Document,
  scores: ArrayLike<number>,
  threshold: number,
): Promise<string> {
  if (isMainThread)
    return request(document.language, "render", [document, scores, threshold]);
  if (
    scores.length !== document.boundaries.length ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1
  )
    throw new Error("Invalid spacing decisions");
  const lines = [...document.lines];
  for (let i = document.boundaries.length - 1; i >= 0; i--) {
    if (!Number.isFinite(scores[i]) || scores[i] < 0 || scores[i] > 1)
      throw new Error("Invalid probability");
    const b = document.boundaries[i];
    lines.splice(
      b.from,
      b.to - b.from,
      ...(scores[i] >= threshold ? [""] : []),
    );
  }
  const output =
    lines.join(document.newline) +
    (document.finalNewline ? document.newline : "");
  const tree = await parse(output, document.language);
  try {
    if (
      flag(tree.rootNode, "hasError") ||
      fingerprint(tree.rootNode) !== document.fingerprint
    )
      throw new Error("Spacing would change the syntax tree");
  } finally {
    tree.delete();
  }
  return output;
}
