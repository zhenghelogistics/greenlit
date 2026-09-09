import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { REQUIRED_JOB_FIELDS } from "../lib/arrival-notice-parser.mjs";

const src = await readFile(new URL("../GreenlitControlTower.jsx", import.meta.url), "utf8");
const start = src.indexOf("function documentFieldBadge(");
const end = src.indexOf("/**", start + 10);
const { documentFieldBadge } = await import(
  "data:text/javascript," + encodeURIComponent(src.slice(start, end) + "\nexport { documentFieldBadge };")
);

test("an optional field the document does not carry is not an alarm", () => {
  // Most arrival notices carry no booking number. Marking that "Missing" in
  // red said the job could not proceed when it could.
  const badge = documentFieldBadge(undefined, false);
  assert.equal(badge.text, "Not on document");
  assert.match(badge.tone, /slate/, "an absent optional field is information, not a problem");
});

test("a required field the document does not carry is an alarm", () => {
  const badge = documentFieldBadge(undefined, true);
  assert.equal(badge.text, "Needed");
  assert.match(badge.tone, /rose/);
});

test("a low-confidence value asks to be checked rather than shouting", () => {
  assert.equal(documentFieldBadge("review", false).text, "Check this");
  assert.match(documentFieldBadge("review", false).tone, /amber/);
});

test("a read value and an edited one are distinguishable", () => {
  assert.equal(documentFieldBadge("high", true).text, "Extracted");
  assert.equal(documentFieldBadge("edited", true).text, "Edited");
});

test("booking number is genuinely optional", () => {
  // The badge's claim and the Apply button's rule are the same list, so this
  // is the assertion that keeps them honest.
  assert.ok(!REQUIRED_JOB_FIELDS.includes("bookingNumber"),
    "if this ever becomes required, the badge follows automatically");
  assert.ok(REQUIRED_JOB_FIELDS.includes("billOfLading"));
});
