import { test } from "node:test";
import assert from "node:assert/strict";
import { toIntakeResult, API_TO_FORM } from "../lib/intake-fields.mjs";

const f = (value, confidence) => ({ value, confidence, source: "d.pdf", extractedAt: "" });

test("carrier vocabulary is translated to the form's", () => {
  const r = toIntakeResult({ fields: { blNumber: f("HLCU123", 0.95), vesselName: f("DALLAS EXPRESS", 0.96) } });
  assert.equal(r.values.billOfLading, "HLCU123");
  assert.equal(r.values.vessel, "DALLAS EXPRESS");
  assert.ok(!("blNumber" in r.values), "the API name must not leak onto the form");
});

test("a low score marks the field for review", () => {
  const r = toIntakeResult({ fields: { eta: f("2026-09-14", 0.62), carrier: f("Maersk", 0.97) } });
  assert.equal(r.confidence.eta, "review");
  assert.equal(r.confidence.carrier, "high");
});

test("the container number becomes a container row, not a form field", () => {
  const r = toIntakeResult({ fields: { containerNumber: f("HLXU1234567", 0.98) } });
  assert.equal(r.containers[0].number, "HLXU1234567");
  assert.ok(!("containerNumber" in r.values));
});

test("an empty extraction still yields one blank container row", () => {
  const r = toIntakeResult({ fields: {} });
  assert.equal(r.containers.length, 1);
  assert.equal(r.containers[0].number, "");
});

test("a field the form has no home for is dropped rather than shown nameless", () => {
  const r = toIntakeResult({ fields: { somethingNew: f("x", 0.9) } });
  assert.deepEqual(r.values, {});
});

test("no two extracted fields write to the same form field", () => {
  // Two API names mapping to one form key would mean the second silently
  // overwrote the first, and which won would depend on key order.
  const targets = Object.values(API_TO_FORM);
  assert.equal(new Set(targets).size, targets.length,
    `duplicate targets: ${targets.filter((t, i) => targets.indexOf(t) !== i).join(", ")}`);
});
