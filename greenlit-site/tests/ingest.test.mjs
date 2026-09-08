import { test } from "node:test";
import assert from "node:assert/strict";
import { extractionStrategy, ingest } from "../lib/ingest.mjs";

const file = (name, type, content = "") =>
  new File([content], name, { type });

test("an email body becomes a readable page", async () => {
  const raw = [
    "From: ops@carrier.com",
    "Subject: Arrival notice",
    "",
    "Vessel DALLAS EXPRESS voyage 632S arriving SINGAPORE on 31 August 2026.",
    "Bill of lading HLCUSZX2607BSUB0.",
  ].join("\n");

  const doc = await ingest(file("notice.eml", "message/rfc822", raw));
  assert.match(doc.text, /DALLAS EXPRESS/);
  assert.match(doc.text, /HLCUSZX2607BSUB0/);
  assert.equal(doc.needsVision, false, "there is text to work with");
  assert.doesNotMatch(doc.text, /Subject:/, "headers are not part of the body");
});

test("quoted-printable soft breaks do not split values", async () => {
  const raw = "h: v\n\nBill of lading HLCUS=\r\nZX2607BSUB0 arriving.";
  const doc = await ingest(file("wrapped.eml", "message/rfc822", raw));
  assert.match(doc.text, /HLCUSZX2607BSUB0/,
    "a value broken across a soft line break must rejoin");
});

test("an unreadable file type is refused by name, not silently ignored", async () => {
  await assert.rejects(
    () => ingest(file("quote.xlsx", "application/vnd.ms-excel")),
    /cannot read quote\.xlsx/,
  );
});

test("oversized input is refused before any parsing", async () => {
  const big = file("huge.pdf", "application/pdf", "x".repeat(16 * 1024 * 1024));
  await assert.rejects(() => ingest(big), /larger than 15 MB/);
});

test("nothing to ingest is a clear error", async () => {
  await assert.rejects(() => ingest(null), /Choose a file/);
});

test("the strategy ladder routes by what the document actually has", () => {
  // A text layer means rung 1 can do the work for free.
  assert.equal(extractionStrategy({ needsVision: false, pages: [{}] }), "TEXT_LAYER");
  // A photograph has pixels but no text: straight to vision.
  assert.equal(
    extractionStrategy({ needsVision: true, pages: [{ imageDataUrl: "data:image/png;base64,x" }] }),
    "IMAGE",
  );
  // A scanned PDF has neither yet — it must be rasterised first.
  // A scanned PDF: no text layer and nothing rasterised. It is sent whole and
  // rendered where it is read, which is why there is no OCR rung to route to.
  assert.equal(extractionStrategy({ needsVision: true, pages: [{ imageDataUrl: null }] }), "RENDERED");
});

test("every ingested document carries its provenance", async () => {
  const doc = await ingest(file("notice.eml", "message/rfc822", "h: v\n\nbody text that is long enough to count"));
  assert.equal(doc.source, "notice.eml");
  assert.ok(doc.receivedAt, "§11.1 requires a timestamp on what was extracted");
  assert.ok(Array.isArray(doc.pages));
  assert.ok(Array.isArray(doc.attachments));
});
