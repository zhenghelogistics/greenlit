# The extraction engine

How to get from "regex over a Hapag-Lloyd text layer" to something that reads a
photographed delivery order with a handwritten container number on it.

## Where we are

`lib/arrival-notice-parser.mjs` is 159 lines of regex over the PDF text layer.
On the sample Hapag-Lloyd notice it pulls 20 fields and misses one. That is a
genuinely good result, and it is also the ceiling.

It works because Hapag-Lloyd emits a consistent machine-generated layout. It
fails completely on:

- a scan or a phone photo — no text layer at all
- anything handwritten
- a carrier whose layout it has never seen
- an email body where the facts are in prose rather than a table

Adding more regex does not fix any of those. It is the wrong tool one layer
too early.

## The shape of the answer

Four stages, and the important part is that they are **separate**:

```
INGEST          any file        →  pages of text and images
CLASSIFY        what is this?   →  document type + carrier
EXTRACT         fields          →  a value per field, with provenance
RECONCILE       what may be     →  updates and discrepancies
                written
```

Today ingest and extract are fused into one regex pass, which is why neither
can be improved without touching the other.

### 1. Ingest — normalise every input to the same thing

One module, one output shape, whatever came in:

| Input | How |
|---|---|
| PDF with a text layer | `pdfjs` — what we already do |
| PDF that is a scan | rasterise each page, hand to OCR/vision |
| PNG, JPG, HEIC | straight to OCR/vision |
| `.eml`, `.msg` | parse MIME: body becomes text, attachments recurse through ingest |

Output is always `{ pages: [{ text, image }], source, receivedAt }`. Everything
downstream stops caring what the file was. This is the single highest-leverage
change, because it is what makes an email with three attachments behave like
three documents.

### 2. Classify before extracting

"Which carrier, which document type" decides which strategy and which prompt
to use. Cheap: a few keyword rules over page one gets carrier and document type
with high accuracy, and it fails safe to `UNKNOWN`, which routes to the general
strategy rather than a wrong template.

§10 already lists the document types. §11.2 already gives the matching priority
order. Neither needs inventing.

### 3. Extract — a ladder, not a single method

Run cheapest first, stop when confident. Each rung produces the **same**
`ExtractedField` envelope that `packages/engine/src/extraction.ts` already
defines — `value`, `source`, `confidence`, `extractedAt` — so the rungs are
directly comparable and the best value per field wins.

| Rung | Handles | Cost | Confidence |
|---|---|---|---|
| **1. Template regex** | Known carrier, text layer | ~0 | 0.95 |
| **2. OCR + template** | Clean scan of a known layout | low | 0.75–0.9 |
| **3. Vision model** | Anything: novel layouts, handwriting, photos | cents | 0.5–0.95, self-reported |

The ladder matters commercially. If 80% of volume is Hapag-Lloyd notices with a
text layer, 80% costs nothing and rung 3 is reserved for the hard 20%.

**Rung 3 is where handwriting is solved.** Not with a handwriting-specific
model — with a vision-language model given the page image and a JSON schema of
the fields wanted. Modern VLMs read a handwritten container number in a printed
form about as well as a person does, and crucially they can say when they
cannot.

### 4. Reconcile — already built

`reconcileExtraction` already decides what may be written: critical fields are
never silently overwritten, conflicts become discrepancies, low confidence goes
to review. Nothing about adding OCR or vision changes this, which is the point
of having built it first.

## Do not fine-tune a model

The instinct on hearing "we will gather documents and learn from them" is to
train something. For this operation that is almost certainly wrong:

- **Volume.** Fine-tuning wants thousands of labelled examples. A few hundred
  arrival notices will not get there, and labelling them is weeks of somebody's
  time.
- **A general VLM already does this.** Reading a shipping document is not a
  specialised skill a frontier model lacks.
- **Every layout change is a retrain.** A carrier redesigns its notice and the
  model degrades silently. A prompt plus a schema absorbs that.
- **You cannot debug a fine-tune.** When it gets a container number wrong there
  is nothing to read.

**What the collected documents are actually for is the golden set.** That is
worth far more than a fine-tune, and it is the thing to build first.

## The golden set — build it before the documents arrive

A golden set is a folder of real documents, each paired with the fields a human
says are correct.

```
fixtures/extraction/
  hapag-noa-001.pdf
  hapag-noa-001.expected.json
  one-do-scan-002.jpg
  one-do-scan-002.expected.json
  handwritten-do-003.jpg
  handwritten-do-003.expected.json
```

A test walks the folder, runs the engine, and reports per-field accuracy. That
gives:

- **A number.** "94% of fields correct across 60 documents, container number
  99%, consignee 71%." Without it, every prompt change is a guess.
- **Regression protection.** Improving handwriting must not break Hapag-Lloyd.
  Nothing else catches that.
- **A priority list.** The worst field is the next thing to work on.

This is the same discipline as the §57 compliance suite: the specification
becomes executable, and the number moves for a reason.

**Start it now, with the one document we have.** One golden case is infinitely
more than none, and the harness is what makes the corpus useful the day it
arrives.

## What to collect

Quality matters more than quantity. Aim for coverage rather than volume:

- **10–20 per carrier** for the top carriers, including at least one edge case
  each — a re-issue, an amendment, a multi-container notice.
- **Every document type in §10**, not just arrival notices: delivery orders,
  bills of lading, permits, VGM declarations, booking confirmations.
- **The awkward ones deliberately.** Photographed on a phone at an angle.
  Faxed then scanned. Handwritten amendments over printed text. These are the
  cases that decide whether the thing is usable in the yard.
- **The failures.** Any document a person had to correct is worth more than ten
  that worked.

For each, the correct field values. A spreadsheet is fine; a script converts it.

## Build order

1. **Split ingest from extract.** No new capability, but nothing else is
   possible until the pipeline stops assuming PDF-with-text.
2. **Golden set harness**, with the one document we have.
3. **Add image and email ingest.** PNG/JPG through rasterise, `.eml` through
   MIME parse with attachments recursing.
4. **Add the vision rung**, routed to only when rungs 1 and 2 fall short.
5. **Then gather the corpus**, and let the harness say what to fix.

Steps 1 and 2 are worth doing before any documents arrive. They are what turn a
pile of PDFs into a measurable engine rather than a pile of PDFs.

## What this does not change

The browser-local contract. Today the PDF never leaves the browser, and the
intake screen says so. **A vision rung breaks that** — the page image has to go
to a model. That is a real decision with a privacy dimension, not a technical
detail: it needs saying out loud, the promise on the screen needs changing, and
it wants a per-customer switch if any customer's documents may not leave the
building.

Rungs 1 and 2 can stay entirely local. Rung 3 cannot.
