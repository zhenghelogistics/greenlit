#!/usr/bin/env node
/**
 * How often extraction reads a document correctly.
 *
 * Points at a folder of real documents and a ground-truth file, so the
 * documents themselves stay out of the repository — they are customers'
 * commercial paperwork, not test fixtures.
 *
 *   node scripts/extraction-accuracy.mjs <folder> <truth.json> [runs]
 *
 * Ground truth must be read off the document, not off a previous extraction.
 * Comparing the model against its own earlier answer measures only whether it
 * is consistent, which it can be while being consistently wrong.
 *
 * Runs above 1 matter because the model is not deterministic: a single clean
 * pass says nothing about the next one. Every run costs money.
 */
import { readFileSync } from 'node:fs';
import { extractWithClaude } from '../greenlit-site/lib/extract-claude.ts';

const [dir, truthPath, runsArg] = process.argv.slice(2);
if (!dir || !truthPath) {
  console.error('usage: node scripts/extraction-accuracy.mjs <folder> <truth.json> [runs]');
  process.exit(2);
}
const truth = JSON.parse(readFileSync(truthPath, 'utf8'));
const RUNS = Number(runsArg ?? 1);

/** Compared on characters that carry meaning: spacing and case do not. */
const norm = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Is this quote actually on the page, rather than composed?
 *
 * Not a substring test. A multi-column notice linearises to
 * "SHIPPER CONSIGNEE PT PERFETTI VAN MELLE" — the label and its value are
 * adjacent on the page and far apart in the text layer — so a strict check
 * failed seven true quotes on one document and reported a 19% error rate that
 * was entirely layout.
 *
 * Every word of the quote must appear somewhere in the document. Order is not
 * required: a table linearises its headers away from its values, so
 * "ETD 05-Sep-26 ETA 08-Sep-26" reads correctly off the page while the text
 * layer holds "ETD ETA ATD ATA" and the dates separately. Requiring order
 * failed that one true quote.
 *
 * The trade is deliberate. This no longer catches a quote that rearranges
 * words genuinely on the page, and it still catches the failure that matters:
 * a quote containing words that are not in the document at all. A fabricated
 * quote is worse than none, because it is what someone would rely on in a
 * dispute precisely because it looks like proof.
 */
function quoteIsGrounded(quote, sourceText) {
  const words = quote.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  if (words.length === 0) return false;
  const haystack = sourceText.toUpperCase();
  return words.every((word) => haystack.includes(word));
}

const results = [];
for (let run = 1; run <= RUNS; run += 1) {
  for (const [name, expect] of Object.entries(truth)) {
    // A read that failed is one failure, not one per expected field. Counting
    // it per field made a single transient error look like a 12% error rate
    // and buried the cause among six identical "got null" lines.
    let r;
    try {
      r = await extractWithClaude({
        fileName: `${name}.pdf`,
        pdfBase64: readFileSync(`${dir}/${name}.pdf`).toString('base64'),
      });
    } catch (cause) {
      results.push({ doc: name, field: 'the read itself', want: 'a response',
        got: cause.message.slice(0, 90), ok: false });
      continue;
    }

    // A quote that is not in the document is fabricated evidence, and worse
    // than no quote at all: it is what a controller would rely on in a dispute
    // precisely because it looks like proof. Checked wherever a text sidecar
    // exists beside the PDF.
    let sourceText = null;
    try {
      const raw = readFileSync(`${dir}/${name}.txt`, "utf8").replace(/\s+/g, " ").trim();
      // A scanned page has a sidecar with nothing in it. Checking quotes
      // against an empty string fails every one of them and says nothing —
      // the first run of this check reported a 27% error rate that was
      // entirely one document with no text layer.
      sourceText = raw.length > 200 ? raw : null;
    } catch { /* no sidecar: nothing to check the quotes against */ }

    if (sourceText) {
      for (const [fieldName, entry] of Object.entries(r.fields)) {
        if (!entry.quote) continue;
        results.push({
          doc: name, field: `${fieldName} quote`,
          want: "words from the document, in order",
          got: quoteIsGrounded(entry.quote, sourceText) ? "grounded" : entry.quote.slice(0, 60),
          ok: quoteIsGrounded(entry.quote, sourceText),
        });
      }
    }

    for (const [fieldName, want] of Object.entries(expect.fields ?? {})) {
      const got = r.fields[fieldName]?.value;
      results.push({ doc: name, field: fieldName, want, got: got ?? null,
        ok: norm(got) === norm(want) });
    }

    for (const wantC of expect.containers ?? []) {
      // Matched by number, then the seal checked on that row. A correct seal
      // against the wrong container is the failure worth catching: it reads as
      // fact and is wrong in a way a blank never is.
      const gotC = r.containers.find((c) => norm(c.containerNumber) === norm(wantC.containerNumber));
      results.push({ doc: name, field: wantC.containerNumber,
        want: wantC.containerNumber, got: gotC?.containerNumber ?? null, ok: Boolean(gotC) });
      if (wantC.sealNumber) {
        results.push({ doc: name, field: `${wantC.containerNumber} seal`,
          want: wantC.sealNumber, got: gotC?.sealNumber ?? null,
          ok: Boolean(gotC) && norm(gotC.sealNumber) === norm(wantC.sealNumber) });
      }
    }

    const invented = r.containers.filter(
      (c) => !(expect.containers ?? []).some((e) => norm(e.containerNumber) === norm(c.containerNumber)));
    results.push({ doc: name, field: 'no invented containers',
      want: String((expect.containers ?? []).length), got: String(r.containers.length),
      ok: invented.length === 0 });
  }
}

const byDoc = {};
for (const r of results) {
  byDoc[r.doc] ??= { total: 0, bad: 0 };
  byDoc[r.doc].total += 1;
  if (!r.ok) byDoc[r.doc].bad += 1;
}

console.log(`\n  ${RUNS} run(s) over ${Object.keys(truth).length} document(s)\n`);
for (const [doc, s] of Object.entries(byDoc)) {
  const pct = ((s.total - s.bad) / s.total * 100).toFixed(1);
  console.log(`    ${doc.padEnd(22)} ${String(s.total - s.bad).padStart(4)}/${String(s.total).padEnd(4)} ${pct.padStart(6)}%  ${truth[doc].note ?? ''}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log('\n  misses:');
  for (const f of failed) {
    console.log(`    ${f.doc} · ${f.field}: wanted ${JSON.stringify(f.want)}, got ${JSON.stringify(f.got)}`);
  }
}

const rate = failed.length / results.length * 100;
console.log(`\n  ${results.length - failed.length}/${results.length} correct · error rate ${rate.toFixed(2)}%\n`);
process.exit(rate < 5 ? 0 : 1);
