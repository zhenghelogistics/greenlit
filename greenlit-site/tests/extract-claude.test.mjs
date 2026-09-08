import { test } from "node:test";
import assert from "node:assert/strict";
import { toFields } from "../lib/extract-claude.ts";

const NOW = "2026-09-08T00:00:00.000Z";

test("a null field is dropped rather than stored as empty", () => {
  const fields = toFields(JSON.stringify({
    containerNumber: { value: "HLXU1234567", confidence: 0.98 },
    blNumber: null,
  }), "noa.pdf", NOW);
  assert.ok("containerNumber" in fields);
  assert.ok(!("blNumber" in fields), "an absent field must not become a stored blank");
});

test("every field carries provenance and a time", () => {
  const fields = toFields(
    JSON.stringify({ eta: { value: "2026-09-14", confidence: 0.8 } }), "scan.jpg", NOW);
  assert.equal(fields.eta.source, "scan.jpg");
  assert.equal(fields.eta.confidence, 0.8);
  assert.equal(fields.eta.extractedAt, NOW);
});

test("a value with no confidence score is unverified, not certain", () => {
  // The schema requires a score, so this is the belt-and-braces case: if one
  // ever arrives without it, defaulting to 1 would write it straight through.
  const fields = toFields(JSON.stringify({ vgm: { value: 21500 } }), "photo.jpg", NOW);
  assert.equal(fields.vgm.confidence, 0, "a missing score must route to review");
});

test("a field object whose value is null is dropped", () => {
  const fields = toFields(
    JSON.stringify({ eta: { value: null, confidence: 0 } }), "x.pdf", NOW);
  assert.deepEqual(Object.keys(fields), []);
});
