import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, encodePair } from "./tokenizer.ts";

test("large upstream lines preserve truncation without exceeding argument limits", () => {
  const text = "a ".repeat(150_000);
  const tokens = tokenize(text);
  assert.ok(tokens.length > 100_000);
  const encoded = encodePair(text, "return result;", 128);
  assert.deepEqual([...encoded.values.subarray(0, 128)], tokens.slice(-128));
  assert.equal(encoded.beforeTruncated, true);
});
