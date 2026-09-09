import { test } from "node:test";
import assert from "node:assert/strict";
import { toFields } from "../lib/extract-claude.ts";

const NOW = "2026-09-08T00:00:00.000Z";
const list = (...fields) => JSON.stringify({ fields });

test("a field absent from the page is simply not listed", () => {
  // containerNumber is no longer a shipment field: it moved to the container
  // list, so that a notice carrying five boxes keeps each one's own seal.
  const f = toFields(list({ name: "vesselName", value: "DALLAS EXPRESS", confidence: 0.98 }), "noa.pdf", NOW);
  assert.ok("vesselName" in f);
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

test("an empty parse yields nothing rather than a phantom field", () => {
  // Guards the shape that fed the silent path: toFields is total, and the
  // caller is what must refuse to treat "nothing read" as a valid extraction.
  assert.deepEqual(toFields(JSON.stringify({ fields: [] }), "x.pdf", NOW), {});
  assert.deepEqual(toFields("{}", "x.pdf", NOW), {});
});

test("§11.1: a field carries where it was read, not just what", () => {
  // The envelope is four values; the page and the line are the fifth and
  // sixth. A value whose source is only a filename can be attributed but not
  // checked, and checking is the whole point in a demurrage dispute.
  const f = toFields(list({
    name: "demurrageFreeDays", value: "3", confidence: 0.93,
    page: 2, quote: "Free demurrage period 3 calendar days (payable to PSA).",
  }), "noa.pdf", NOW);

  assert.equal(f.demurrageFreeDays.value, "3");
  assert.equal(f.demurrageFreeDays.page, 2, "the page the value was read from");
  assert.match(f.demurrageFreeDays.quote, /Free demurrage period 3 calendar days/);
});

test("a field with no provenance is still a field", () => {
  // Provenance is required of the model, so this is the belt-and-braces case:
  // a value that arrives without it must not throw, and must not claim page 0
  // or an empty quote, either of which would read as a real answer.
  const f = toFields(list({ name: "eta", value: "2026-09-14", confidence: 0.9 }), "x.pdf", NOW);
  assert.equal(f.eta.page, null);
  assert.equal(f.eta.quote, null);
});
