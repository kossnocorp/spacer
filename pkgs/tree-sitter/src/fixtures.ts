export const fixtures: Record<string, { code: string; entity: string }> = {
  bash: { code: 'for item in items; do echo "$item"; done\n', entity: "LOOP" },
  c: {
    code: "void run() { for (int i = 0; i < 3; i++) { use(i); } }\n",
    entity: "LOOP",
  },
  c_sharp: {
    code: "class App { void Run() { foreach (var item in items) { Use(item); } } }",
    entity: "LOOP",
  },
  cpp: {
    code: "void run() { for (auto item : items) { use(item); } }",
    entity: "LOOP",
  },
  css: { code: ".item { color: red; }", entity: "IDENTIFIER" },
  dart: {
    code: "void run() { for (var item in items) { use(item); } }",
    entity: "LOOP",
  },
  elisp: { code: "(defun run (value) (+ value 1))", entity: "IDENTIFIER" },
  elixir: {
    code: "def run(value) do\n  value + 1\nend\n",
    entity: "IDENTIFIER",
  },
  elm: {
    code: "module Main exposing (..)\nrun value = value + 1\n",
    entity: "FUNCTION",
  },
  embedded_template: { code: "<p><%= value %></p>", entity: "UNKNOWN" },
  go: {
    code: "package main\nfunc run() { for _, item := range items { use(item) } }\n",
    entity: "LOOP",
  },
  html: { code: '<p class="item">hello</p>', entity: "IDENTIFIER" },
  java: {
    code: "class App { void run() { for (Item item : items) { use(item); } } }",
    entity: "LOOP",
  },
  javascript: {
    code: "function run() { for (const item of items) { use(item); } }",
    entity: "LOOP",
  },
  json: { code: '{"value": 1}', entity: "OBJECT" },
  kotlin: {
    code: "fun run() { for (item in items) { use(item) } }",
    entity: "LOOP",
  },
  lua: { code: "for item = 1, 3 do\n  use(item)\nend", entity: "LOOP" },
  objc: {
    code: "void run() { for (int i=0; i<3; i++) { use(i); } }",
    entity: "LOOP",
  },
  ocaml: { code: "let run value = value + 1\n", entity: "NUMBER" },
  php: {
    code: "<?php foreach ($items as $item) { useItem($item); }",
    entity: "LOOP",
  },
  python: {
    code: "def run():\n    for item in items:\n        use(item)\n",
    entity: "LOOP",
  },
  ql: { code: "from int x where x = 1 select x", entity: "NUMBER" },
  rescript: { code: "let value = 1\n", entity: "NUMBER" },
  ruby: { code: "for item in items\n  use(item)\nend\n", entity: "LOOP" },
  rust: {
    code: "fn run() { for item in items { use_item(item); } }",
    entity: "LOOP",
  },
  scala: {
    code: "object App { def run(value: Int) = value + 1 }",
    entity: "FUNCTION",
  },
  solidity: {
    code: "pragma solidity ^0.8.0; contract App { function run() public { for (uint i=0; i<3; i++) {} } }",
    entity: "LOOP",
  },
  swift: {
    code: "func run() { for item in items { use(item) } }",
    entity: "LOOP",
  },
  systemrdl: {
    code: "addrmap top { reg { field {} value[7:0]; } control; };",
    entity: "NUMBER",
  },
  tlaplus: { code: "---- MODULE Test ----\nx == 1\n====\n", entity: "NUMBER" },
  toml: { code: "value = 1\n", entity: "NUMBER" },
  tsx: {
    code: "function run() { for (const item of items) { use(item); } }",
    entity: "LOOP",
  },
  typescript: {
    code: "function run() { for (const item of items) { use(item); } }",
    entity: "LOOP",
  },
  vue: {
    code: "<template><p>{{ value }}</p></template>\n",
    entity: "IDENTIFIER",
  },
  yaml: { code: "value: 1\n", entity: "NUMBER" },
  zig: {
    code: "fn run() void { for (items) |item| { use(item); } }",
    entity: "LOOP",
  },
};
