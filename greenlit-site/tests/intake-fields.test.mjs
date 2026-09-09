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

test("every container on the document becomes its own row", () => {
  // A single containerNumber field lost four of the five containers on a real
  // Hapag notice, and paired the one it kept with a seal from another row.
  const r = toIntakeResult({ fields: {}, containers: [
    { containerNumber: "UETU9346085", sizeType: "40 HQ", sealNumber: "HLK8024332", confidence: 0.95 },
    { containerNumber: "CAJU5607991", sizeType: "40 HQ", sealNumber: "HLK8028097", confidence: 0.94 },
  ] });
  assert.equal(r.containers.length, 2);
  assert.equal(r.containers[0].number, "UETU9346085");
  assert.equal(r.containers[0].seal, "HLK8024332", "a seal must stay with its own container");
  assert.equal(r.containers[1].number, "CAJU5607991");
  assert.equal(r.containers[1].seal, "HLK8028097");
  assert.ok(!("containerNumber" in r.values), "container values do not leak onto the shipment form");
});

test("a document listing no container still yields one empty row", () => {
  // A job with no container cannot progress, so there has to be somewhere to
  // type the number when it arrives.
  const r = toIntakeResult({ fields: {}, containers: [] });
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

test("a house bill reaches the form under its own name", () => {
  const r = toIntakeResult({ fields: {
    blNumber: f("KMTCSHKB016289", 0.96),
    houseBlNumber: f("HBL-SG-99120", 0.91),
  } });
  assert.equal(r.values.billOfLading, "KMTCSHKB016289");
  assert.equal(r.values.houseBillOfLading, "HBL-SG-99120");
});

test("a document with no house bill leaves the field empty, not blank-filled", () => {
  // Optional by nature: most direct carrier documents carry no house bill, and
  // an empty string would look like one that was looked for and not found.
  const r = toIntakeResult({ fields: { blNumber: f("KMTCSHKB016289", 0.96) } });
  assert.equal(r.values.billOfLading, "KMTCSHKB016289");
  assert.ok(!("houseBillOfLading" in r.values));
});
