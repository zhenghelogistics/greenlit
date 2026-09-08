import { test } from "node:test";
import assert from "node:assert/strict";
import { toFields } from "../lib/extract-claude.ts";

const NOW = "2026-09-08T00:00:00.000Z";

test("a null field is dropped rather than stored as empty", () => {
  const fields = toFields(
    JSON.stringify({ containerNumber: "HLXU1234567", blNumber: null, confidence: { containerNumber: 0.98 } }),
    "noa.pdf", NOW,
  );
  assert.ok("containerNumber" in fields);
  assert.ok(!("blNumber" in fields), "an absent field must not become a stored blank");
});

test("every field carries provenance and a time", () => {
  const fields = toFields(
    JSON.stringify({ eta: "2026-09-14", confidence: { eta: 0.8 } }), "scan.jpg", NOW,
  );
  assert.equal(fields.eta.source, "scan.jpg");
  assert.equal(fields.eta.confidence, 0.8);
  assert.equal(fields.eta.extractedAt, NOW);
});

test("a value with no confidence score is unverified, not certain", () => {
  // The failure this guards: a model that returns a value but omits its score.
  // Defaulting to 1 would write it straight through as though it were trusted.
  const fields = toFields(JSON.stringify({ vgm: 21500, confidence: {} }), "photo.jpg", NOW);
  assert.equal(fields.vgm.confidence, 0, "a missing score must route to review");
});

test("the confidence map itself never becomes a field", () => {
  const fields = toFields(JSON.stringify({ confidence: { eta: 0.9 } }), "x.pdf", NOW);
  assert.deepEqual(Object.keys(fields), []);
});
