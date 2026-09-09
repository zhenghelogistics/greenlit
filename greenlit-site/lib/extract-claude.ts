/**
 * Document extraction with Claude — the vision rung of the ladder in
 * docs/extraction-engine.md.
 *
 * The rungs below this one (template regex, text layer) are cheap, offline and
 * deterministic, and they handle a carrier's own PDF perfectly well. They
 * cannot read a photograph of a handwritten note, which is the case this
 * exists for. It is the last rung because it is the expensive one, not the
 * best one: a template match on a known Hapag-Lloyd layout is more reliable
 * than any model reading the same page.
 *
 * Two rules hold here and are enforced below, not merely documented:
 *
 *   Nothing is invented. A field absent from the page comes back null. A
 *   plausible guess is worse than a blank, because a blank asks a human and a
 *   guess does not.
 *
 *   Nothing is trusted. Every value returns with the model's own confidence
 *   and the page it came from, and flows through reconcileExtraction() in
 *   @greenlit/engine like any other source — so §12 still holds and a critical
 *   field still raises a discrepancy rather than overwriting silently.
 */
import Anthropic from "@anthropic-ai/sdk";
import { field, type ExtractedField } from "@greenlit/engine";

/** The operational fields worth reading off a shipping document. */
const FIELDS: Record<string, { type: string; description?: string }> = {
  blNumber: { type: "string", description: "The carrier's own bill of lading number (the master B/L). Never the house B/L." },
  houseBlNumber: { type: "string", description: "House bill of lading, issued by a freight forwarder rather than the carrier. Labelled inconsistently: House BL, House B/L, HOUSE BILL OF LADING, HBL, HB/L, H B/L, or as a column heading beside the ocean or master bill. Absent entirely on a direct carrier booking." },
  bookingReference: { type: "string" },
  carrier: { type: "string", description: "Shipping line, e.g. Hapag-Lloyd" },
  vesselName: { type: "string" },
  voyage: { type: "string" },
  eta: { type: "string", description: "Arrival date as YYYY-MM-DD" },
  portOfLoading: { type: "string", description: "The place name only. Documents often print a UN/LOCODE beside it — \"SGSIN = Singapore, Singapore\" is SINGAPORE, \"CNSHA Shanghai\" is SHANGHAI." },
  portOfDischarge: { type: "string", description: "The place name only. Documents often print a UN/LOCODE beside it — \"SGSIN = Singapore, Singapore\" is SINGAPORE, \"CNSHA Shanghai\" is SHANGHAI." },
  terminal: { type: "string", description: "Discharging terminal" },
  shipper: { type: "string", description: "Shipper company name only, without the address" },
  carrierReference: { type: "string", description: "The carrier's own reference for this shipment" },
  consignee: { type: "string", description: "Consignee company name only, without the address" },
  notifyParty: { type: "string", description: "Notify party company name only, without the address. Carriers that print no consignee often print this instead." },
  deliveryAddress: { type: "string" },
  emptyReturnYard: { type: "string" },
  freeTimeModel: { type: "string", description: "SPLIT when the document states demurrage and detention separately. COMBINED when it states one pool covering both, e.g. 'combined D&D 14 days'. Omit entirely if the document does not say." },
  demurrageFreeDays: { type: "string", description: "Digits only. Only when the document states demurrage separately." },
  detentionFreeDays: { type: "string", description: "Digits only. Only when the document states detention separately." },
  combinedFreeDays: { type: "string", description: "Digits only. Only when the document states a single combined D&D allowance." },
  freeTimeRemarks: { type: "string", description: "The free-time terms exactly as worded, when they carry a condition a number cannot, e.g. '10 combined calendar days from discharge' or 'detention starts after empty return notification'." },
  permitNumber: { type: "string" },
  vgm: { type: "string", description: "Verified gross mass in kg, digits only" },
};

/**
 * The model returns a list of what it found, not a slot per field.
 *
 * A slot per field needs every slot to be nullable, and the API caps how many
 * union-typed parameters a schema may have (16) — which the field list
 * outgrew as soon as the review screen asked for five more. A list has no
 * unions at all, and it scales: adding a field costs one enum member.
 *
 * It also states absence more honestly. There is no empty slot to fill in, so
 * "not on the page" is expressed by not listing it, rather than by a null the
 * model has to choose to emit.
 */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    /**
     * One entry per container on the document.
     *
     * A single containerNumber field lost four of the five containers on a
     * real Hapag notice — and paired the one it kept with a seal from a
     * different row, which is worse than losing them: a container shown with
     * another box's seal reads as fact. Number, seal, size and weight belong
     * to one another and have to be read as a row.
     */
    containers: {
      type: "array",
      description: "Every container listed. One entry each, with that container's own seal, size and weight. Empty string for anything the document does not state for that container.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          containerNumber: { type: "string", description: "ISO 6346, 4 letters + 7 digits, no spaces" },
          sizeType: { type: "string", description: "As printed, e.g. 40 HQ, 20 GP, 20' GENERAL PURPOSE" },
          sealNumber: { type: "string", description: "This container's own seal" },
          grossWeight: { type: "string", description: "Kilograms, bare number, no unit" },
          packageCount: { type: "string", description: "Digits only" },
          packageType: { type: "string", description: "Single word: CASE, CARTON, PALLET, CTN" },
          confidence: { type: "number", description: "0-1, how clearly you could read this row" },
        },
        required: ["containerNumber", "sizeType", "sealNumber", "grossWeight",
                   "packageCount", "packageType", "confidence"],
      },
    },
    fields: {
      type: "array",
      description: "One entry per field you could actually read. Omit anything not on the page.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", enum: Object.keys(FIELDS) },
          value: { type: "string", description: "The value as printed. Numbers as digits, dates as YYYY-MM-DD." },
          confidence: { type: "number", description: "0-1, how clearly you could read it" },
          page: { type: "integer", description: "Which page you read it from, counting from 1." },
          quote: {
            type: "string",
            description: "The line as it appears on the page, verbatim and including its label — e.g. \"Free demurrage period 3 calendar days\". Long enough for a person to find it, at most about 15 words. Copy it; do not paraphrase.",
          },
        },
        required: ["name", "value", "confidence", "page", "quote"],
      },
    },
  },
  required: ["fields", "containers"],
} as const;

const SYSTEM = `You read shipping documents for a Singapore haulier and return structured fields.

Documents range from a clean carrier PDF to a phone photograph of a handwritten note. Read what is on the page and nothing else.

Rules:
- A field not present on the page is null. Never infer, complete, or guess a value from context or from what is typical. A blank prompts a human to check; a wrong value does not.
- Never repair a value into what it "should" be. If a container number is smudged and you can only read HLXU12345??, return null rather than a completed guess.
- Every field you return must carry a confidence between 0 and 1 reflecting how clearly you could read it. Clean printed text is high. Handwriting, a skewed photo, or a partly obscured field is low. Be honest — a low score routes the field to a human, which is the correct outcome when you are unsure.
- consignee, notifyParty and shipper are company names only. Leave out the street address, postcode and country.
- Dates as YYYY-MM-DD. If a date is ambiguous between formats (03/04/2026), return null rather than picking one.
- Container numbers are 4 letters then 7 digits, no spaces.
- Every field carries the page it came from and the line as printed. The quote is what lets a person check the value against the document without reading all of it, so copy the text exactly, including the label beside it, and never paraphrase or reconstruct it.
- grossWeight is the cargo weight the document declares. vgm is a separately verified figure and usually appears only on export paperwork; do not copy one into the other.
- Free time comes in two shapes and they are not interchangeable. Some carriers state demurrage and detention as separate allowances; others state a single combined D&D pool covering both. Report freeTimeModel as SPLIT or COMBINED to say which the document uses, and fill only the matching fields — never both shapes. Splitting a combined allowance in two invents a deadline that does not exist. If the document does not make the shape clear, omit freeTimeModel rather than assuming.
- A document may carry two bills of lading. The carrier issues the master or ocean bill; a freight forwarder issues the house bill. Put each under its own name and never the house number under blNumber — they identify different contracts, and confusing them misroutes the shipment.
- The house bill is labelled inconsistently: "House BL", "House B/L", "HOUSE BILL OF LADING", "HBL", "HB/L", "H B/L", sometimes only as a column heading beside "Ocean Bill of Lading" or "Master B/L", and sometimes in a table where the heading row and the value row are far apart. Read it wherever it appears.
- A booking made directly with the carrier has no house bill at all. That is the ordinary case, not a failure to find one: do not list houseBlNumber, and never repeat the master number there.`;

export interface ExtractedContainer {
  containerNumber: string;
  sizeType: string;
  sealNumber: string;
  grossWeight: string;
  packageCount: string;
  packageType: string;
  confidence: number;
}

/** §11.1's envelope, plus where on the page the value was read. */
export interface ExtractedFieldWithSource extends ExtractedField<unknown> {
  page: number | null;
  quote: string | null;
}

export interface ClaudeExtractionResult {
  fields: Record<string, ExtractedFieldWithSource>;
  containers: ExtractedContainer[];
  model: string;
  usage: { input: number; output: number };
}

/**
 * Turn the model's JSON into engine fields.
 *
 * Separate from the request so the mapping is testable without spending money
 * or needing a key — and the mapping is where the safety decisions live.
 */
/** Fields whose value is a place, and so goes through normalisePlace. */
const PLACE_FIELDS = new Set(['portOfLoading', 'portOfDischarge']);

/**
 * UN/LOCODEs a Singapore haulier meets constantly.
 *
 * Deliberately small and deliberately not a master list. Some documents print
 * the code alone — the KMTC advice gives "SGSIN" and no name — and there is
 * nothing in the text to expand it from. This covers the home port and its
 * usual origins; anything else keeps the code, which is still correct, just
 * less readable. A full LOCODE table is master data, and master data belongs
 * in the database rather than compiled into an extractor.
 */
const LOCODES: Record<string, string> = {
  SGSIN: 'SINGAPORE', MYPKG: 'PORT KLANG', MYTPP: 'TANJUNG PELEPAS',
  CNSHA: 'SHANGHAI', CNNSA: 'NANSHA', CNSZX: 'SHENZHEN', CNNGB: 'NINGBO',
  CNYTN: 'YANTIAN', CNQIN: 'QINGDAO', CNTAO: 'QINGDAO', CNXMN: 'XIAMEN',
  HKHKG: 'HONG KONG', KRPUS: 'BUSAN', JPTYO: 'TOKYO', JPYOK: 'YOKOHAMA',
  THLCH: 'LAEM CHABANG', VNSGN: 'HO CHI MINH CITY', IDJKT: 'JAKARTA',
  INNSA: 'NHAVA SHEVA', AEJEA: 'JEBEL ALI', NLRTM: 'ROTTERDAM',
};

/**
 * A port as a place name.
 *
 * Documents print the UN/LOCODE beside the name — "SGSIN = Singapore,
 * Singapore" — and the prompt asking for the name alone did not reliably get
 * it. Normalising here rather than asking again is the same lesson as the
 * weights: what arrives is what has to be handled, and a value that is right
 * but unusable still costs a controller the time to fix it.
 *
 * The code is only dropped when something is left after it, so a five-letter
 * place — TOKYO, BUSAN — survives intact.
 */
export function normalisePlace(raw: string): string {
  // (?![A-Z]) keeps SINGAPORE whole: without it the rule ate the first five
  // letters and returned PORE.
  const withoutCode = raw.replace(/^\s*[A-Z]{5}(?![A-Z])\s*(?:=|-|:)?\s*(?=\S)/, '');
  const text = (withoutCode.trim() ? withoutCode : raw).trim();
  // "Singapore, Singapore" is city then country; the first is the port.
  const place = text.split(',')[0]!.trim();
  // A bare code has no name beside it to recover, so expand what we know.
  return LOCODES[place.toUpperCase()] ?? place;
}

export function toFields(
  json: string, fileName: string, now: string,
): Record<string, ExtractedFieldWithSource> {
  const parsed = JSON.parse(json) as {
    fields?: Array<{ name?: string; value?: unknown; confidence?: number;
                     page?: number; quote?: string }>;
  };

  const fields: Record<string, ExtractedFieldWithSource> = {};
  for (const entry of parsed.fields ?? []) {
    // An unknown name is dropped rather than stored: the form has nowhere to
    // put it, and a field nothing renders is a field nobody checks.
    if (!entry?.name || !(entry.name in FIELDS)) continue;
    if (entry.value === null || entry.value === undefined || entry.value === "") continue;
    // A value that arrives without a score is treated as unverified rather
    // than certain: 0 routes it to a human, where 1 would let a silent
    // omission read as agreement.
    const value = PLACE_FIELDS.has(entry.name) && typeof entry.value === 'string'
      ? normalisePlace(entry.value)
      : entry.value;
    fields[entry.name] = {
      ...field(value, fileName, entry.confidence ?? 0, now),
      // §11.1 carries four values; these are the fifth and sixth. A value
      // whose source is a filename can be attributed but not checked — the
      // page and the line are what let a controller verify a number in a
      // dispute without reading a four-page notice to find it.
      page: typeof entry.page === "number" ? entry.page : null,
      quote: typeof entry.quote === "string" ? entry.quote.trim() : null,
    };
  }
  return fields;
}

/**
 * The container rows, keeping each row's values together.
 *
 * A row with no number is dropped: it is a header or a stray line, and a
 * container with a seal but no number cannot be matched to anything.
 */
export function toContainers(json: string): ExtractedContainer[] {
  const parsed = JSON.parse(json) as { containers?: Array<Record<string, unknown>> };
  return (parsed.containers ?? [])
    .map((c) => ({
      containerNumber: String(c.containerNumber ?? "").replace(/\s+/g, "").toUpperCase(),
      sizeType: String(c.sizeType ?? ""),
      sealNumber: String(c.sealNumber ?? ""),
      grossWeight: String(c.grossWeight ?? ""),
      packageCount: String(c.packageCount ?? ""),
      packageType: String(c.packageType ?? ""),
      confidence: typeof c.confidence === "number" ? c.confidence : 0,
    }))
    .filter((c) => c.containerNumber !== "");
}

export function claudeExtractionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * `pages` are the normalised output of ingest(): each carries either a text
 * layer or a base64 image. Images are sent as image blocks, a PDF as a
 * document block, so the model sees the layout rather than a flattened string.
 */
export async function extractWithClaude(
  document: {
    fileName: string;
    pdfBase64?: string;
    images?: Array<{ base64: string; mediaType: string }>;
    text?: string;
  },
  now: string = new Date().toISOString(),
): Promise<ClaudeExtractionResult> {
  if (!claudeExtractionAvailable()) {
    throw new Error("ANTHROPIC_API_KEY is not set — vision extraction is unavailable");
  }
  const client = new Anthropic();

  const content: Anthropic.ContentBlockParam[] = [];
  if (document.pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: document.pdfBase64 },
    });
  }
  for (const image of document.images ?? []) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType as "image/png" | "image/jpeg",
        data: image.base64,
      },
    });
  }
  if (document.text) {
    content.push({ type: "text", text: `Document text:\n\n${document.text}` });
  }
  content.push({ type: "text", text: "Extract the fields you can read. Return null for anything absent." });

  // Streamed because a multi-page scan plus adaptive thinking can exceed the
  // non-streaming HTTP timeout.
  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [{ role: "user", content }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error(`Extraction declined: ${response.stop_details?.explanation ?? "no reason given"}`);
  }

  // A truncated response is not a shorter answer, it is an unfinished one: the
  // JSON is cut mid-object and whatever survives is a fragment of the page.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "The document was too long to read in one pass and the answer was cut off. "
      + "Split it and try the pages separately.",
    );
  }

  // The silent path this replaces: no text block defaulted to "{}", so a
  // transient failure returned an empty extraction rather than an error — and
  // an empty extraction creates a job with nothing on it, which looks like a
  // document that said nothing rather than a read that did not happen.
  const text = response.content.find((b) => b.type === "text");
  if (!text || !("text" in text) || !text.text.trim()) {
    throw new Error(`Nothing came back for ${document.fileName}. Try again.`);
  }

  const json = text.text;
  const fields = toFields(json, document.fileName, now);
  const containers = toContainers(json);

  if (Object.keys(fields).length === 0 && containers.length === 0) {
    throw new Error(
      `No shipment details could be read from ${document.fileName}. `
      + "Check it is a carrier document, and that scanned pages are legible.",
    );
  }

  return {
    fields,
    containers,
    model: response.model,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}
