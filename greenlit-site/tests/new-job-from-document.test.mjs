import assert from "node:assert/strict";
import test from "node:test";
import { jobFromDocument, EMPTY_ROW } from "../lib/new-job-from-document.mjs";
import { toFields } from "../lib/extract-claude.ts";

/**
 * The shape this mapping reads is not a guess.
 *
 * The bug this file exists for: the form read `response.fields` as a list and
 * called `.map` on it, and the route returns it keyed by field name. It threw
 * on the first document anybody uploaded, and nothing caught it, because the
 * only way to run the mapping was to render the form and upload a PDF.
 *
 * So every test below builds its input with the real `toFields` — the
 * same function the route uses — rather than by writing out what its output is
 * assumed to look like. If that shape ever changes again, these fail here
 * instead of in somebody's browser.
 */
const read = (fields, containers = []) => ({
  fields: toFields(JSON.stringify({ fields }), "notice.pdf", "2026-09-24T00:00:00.000Z"),
  containers,
});

const sure = (name, value) => ({ name, value, confidence: 1, page: 1, quote: `${name}: ${value}` });

test("the envelope is read as an envelope, not as a list", () => {
  // The whole bug, in one assertion. `fields` arrives keyed by name; treating
  // it as an array threw before a single field was mapped.
  const result = jobFromDocument(read([sure("vesselName", "DALLAS EXPRESS")]));
  assert.equal(result.job.vesselName, "DALLAS EXPRESS");
});

test("a list where the envelope should be is survived, not thrown on", () => {
  // Defence rather than decoration: this is the shape that actually arrived,
  // and a form that throws loses everything already typed into it.
  assert.deepEqual(jobFromDocument({ fields: [], containers: [] }).job, {});
  assert.deepEqual(jobFromDocument({}).job, {});
  assert.deepEqual(jobFromDocument(null).job, {});
});

test("only fields this form can show are taken", () => {
  // The reader finds more than this form has room for. A value written into a
  // job with nowhere on screen to display it is one nobody can check.
  const result = jobFromDocument(read([
    sure("vesselName", "DALLAS EXPRESS"),
    sure("portOfLoading", "SHANGHAI"),
    sure("consignee", "DKSH"),
    sure("terminal", "PSA"),
  ]));
  assert.deepEqual(Object.keys(result.job), ["vesselName"]);
});

test("the delivery address is returned to be shown, never to be applied", () => {
  // §-by-construction. "12 Jurong Port Rd" and a saved "12 Jurong Port Road"
  // are the same place to a person and two places to anything that groups by
  // it, so the match is a judgement and a judgement needs a judge.
  const result = jobFromDocument(read([sure("deliveryAddress", "12 Jurong Port Rd")]));
  assert.equal(result.readAddress, "12 Jurong Port Rd");
  assert.equal("deliveryAddress" in result.job, false);
  assert.equal(result.job.deliveryAddress, undefined);
});

test("a confident value is marked read and a doubtful one asks to be checked", () => {
  const result = jobFromDocument(read([
    { name: "vesselName", value: "DALLAS EXPRESS", confidence: 1, page: 1, quote: "v" },
    { name: "blNumber", value: "HLCU123", confidence: 0.4, page: 1, quote: "b" },
  ]));
  assert.equal(result.filled.vesselName, "read");
  assert.equal(result.filled.blNumber, "review",
    "a value the reader was unsure of is written in and flagged, not dropped");
});

test("the ETA keeps its time, and splits into the two controls the form has", () => {
  const withTime = jobFromDocument(read([sure("eta", "2026-09-24 17:00")]));
  assert.equal(withTime.job.etaDate, "2026-09-24");
  assert.equal(withTime.job.etaTime, "17:00");

  const dateOnly = jobFromDocument(read([sure("eta", "2026-09-24")]));
  assert.equal(dateOnly.job.etaDate, "2026-09-24");
  assert.equal(dateOnly.job.etaTime, undefined, "no time invented where none was printed");
});

test("intake's vocabulary is translated into this form's", () => {
  // Intake speaks the review screen's names and this form speaks its own.
  // Both are arbitrary; what matters is that the join is one table and not a
  // second reading of the document.
  const result = jobFromDocument(read([
    sure("voyage", "632S"), sure("blNumber", "HLCU123"),
    sure("bookingReference", "34416855"), sure("vesselName", "DALLAS EXPRESS"),
  ]));
  assert.equal(result.job.voyageNumber, "632S");
  assert.equal(result.job.blNumber, "HLCU123");
  assert.equal(result.job.bookingReference, "34416855");
  assert.equal(result.job.vesselName, "DALLAS EXPRESS");
  assert.equal(result.job.voyage, undefined, "intake's own names do not leak through");
  assert.equal(result.job.vessel, undefined);
});

test("a permit on the document is a job that needs a permit", () => {
  // Only ever turned on. A permit in hand is evidence; a customer record that
  // says nothing is not evidence of the opposite.
  const result = jobFromDocument(read([
    sure("permitNumber", "IG6I789494H"),
    sure("permitExpiryDate", "2026-10-30"),
    sure("permitVesselVoyage", "DALLAS EXPRESS 632S"),
  ]));
  assert.equal(result.job.permitRequired, true);
  assert.equal(result.job.permitNumber, "IG6I789494H");
  assert.equal(result.job.permitExpiryDate, "2026-10-30");
  assert.equal(result.job.permitVesselVoyage, "DALLAS EXPRESS 632S",
    "the sailing is copied verbatim, because checkPermit compares it to the job's");

  assert.equal(jobFromDocument(read([sure("vesselName", "X")])).job.permitRequired, undefined,
    "a document with no permit says nothing either way");
});

test("containers replace a blank form and never overwrite typing", () => {
  const containers = [
    { containerNumber: "segu3218850", sizeType: "40hq", sealNumber: "S1", grossWeight: "18000" },
    { containerNumber: "TCLU1234567", sizeType: "20GP", sealNumber: "S2", grossWeight: "9000" },
  ];

  const onBlank = jobFromDocument(read([], containers), [{ ...EMPTY_ROW }]);
  assert.equal(onBlank.rows.length, 2);
  assert.equal(onBlank.rows[0].containerNumber, "SEGU3218850", "business fields are shouted");
  assert.equal(onBlank.rows[0].sizeType, "40HQ");

  const typed = [{ ...EMPTY_ROW, containerNumber: "MYOWN1234567" }];
  assert.equal(jobFromDocument(read([], containers), typed).rows, null,
    "a form somebody has typed into is left alone");
});

test("free time is taken only in the shape the document stated", () => {
  // Splitting a combined allowance in two invents a deadline that does not
  // exist, so the reader omits the shape rather than guessing and so does this.
  const combined = jobFromDocument(read(
    [sure("freeTimeModel", "COMBINED"), sure("combinedFreeDays", "14")],
    [{ containerNumber: "SEGU3218850", sizeType: "40HQ" }],
  ));
  assert.equal(combined.rows[0].freeTimeModel, "COMBINED");
  assert.equal(combined.rows[0].combinedFreeDays, "14");
  assert.equal(combined.rows[0].demurrageFreeDays, "");

  const split = jobFromDocument(read(
    [sure("freeTimeModel", "SPLIT"), sure("demurrageFreeDays", "3"), sure("detentionFreeDays", "7")],
    [{ containerNumber: "SEGU3218850", sizeType: "40HQ" }],
  ));
  assert.equal(split.rows[0].freeTimeModel, "SPLIT");
  assert.equal(split.rows[0].demurrageFreeDays, "3");
  assert.equal(split.rows[0].detentionFreeDays, "7");
  assert.equal(split.rows[0].combinedFreeDays, "");
});

test("a container with neither a number nor a size is not a container", () => {
  const result = jobFromDocument(read([], [
    { containerNumber: "", sizeType: "", sealNumber: "S1" },
    { containerNumber: "SEGU3218850", sizeType: "40HQ" },
  ]), [{ ...EMPTY_ROW }]);
  assert.equal(result.rows.length, 1);
});

test("the count is what the form will show as having been read", () => {
  const result = jobFromDocument(read(
    [sure("vesselName", "DALLAS EXPRESS"), sure("blNumber", "HLCU123")],
    [{ containerNumber: "SEGU3218850", sizeType: "40HQ" }],
  ), [{ ...EMPTY_ROW }]);
  assert.equal(result.count, 3, "two fields and one container");
});
