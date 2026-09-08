import { test } from "node:test";
import assert from "node:assert/strict";
import { toFields } from "../lib/extract-claude.ts";

const NOW = "2026-09-08T00:00:00.000Z";
const list = (...fields) => JSON.stringify({ fields });

test("a field absent from the page is simply not listed", () => {
  const f = toFields(list({ name: "containerNumber", value: "HLXU1234567", confidence: 0.98 }), "noa.pdf", NOW);
  assert.ok("containerNumber" in f);
  assert.ok(!("blNumber" in f), "an unlisted field must not become a stored blank");
});

test("every field carries provenance and a time", () => {
  const f = toFields(list({ name: "eta", value: "2026-09-14", confidence: 0.8 }), "scan.jpg", NOW);
  assert.equal(f.eta.source, "scan.jpg");
  assert.equal(f.eta.confidence, 0.8);
  assert.equal(f.eta.extractedAt, NOW);
});

test("a value with no confidence score is unverified, not certain", () => {
  const f = toFields(list({ name: "vgm", value: "21500" }), "photo.jpg", NOW);
  assert.equal(f.vgm.confidence, 0, "a missing score must route to review");
});

test("a name the schema does not define is dropped", () => {
  // Nothing renders it, so storing it would create a value nobody checks.
  const f = toFields(list({ name: "inventedField", value: "x", confidence: 0.9 }), "x.pdf", NOW);
  assert.deepEqual(Object.keys(f), []);
});

test("an empty string is absence, not a value", () => {
  const f = toFields(list({ name: "eta", value: "", confidence: 0.4 }), "x.pdf", NOW);
  assert.deepEqual(Object.keys(f), []);
});

test("an empty list yields no fields rather than throwing", () => {
  assert.deepEqual(toFields(JSON.stringify({ fields: [] }), "x.pdf", NOW), {});
  assert.deepEqual(toFields("{}", "x.pdf", NOW), {});
});
