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
  containerNumber: { type: "string", description: "ISO 6346, 4 letters + 7 digits, e.g. HLXU1234567" },
  blNumber: { type: "string", description: "The carrier's own bill of lading number (the master B/L). Never the house B/L." },
  houseBlNumber: { type: "string", description: "House bill of lading, issued by a freight forwarder rather than the carrier. Labelled inconsistently: House BL, House B/L, HOUSE BILL OF LADING, HBL, HB/L, H B/L, or as a column heading beside the ocean or master bill. Absent entirely on a direct carrier booking." },
  bookingReference: { type: "string" },
  carrier: { type: "string", description: "Shipping line, e.g. Hapag-Lloyd" },
  vesselName: { type: "string" },
  voyage: { type: "string" },
  eta: { type: "string", description: "Arrival date as YYYY-MM-DD" },
  portOfLoading: { type: "string" },
  portOfDischarge: { type: "string" },
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
        },
        required: ["name", "value", "confidence"],
      },
    },
  },
  required: ["fields"],
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
- Free time comes in two shapes and they are not interchangeable. Some carriers state demurrage and detention as separate allowances; others state a single combined D&D pool covering both. Report freeTimeModel as SPLIT or COMBINED to say which the document uses, and fill only the matching fields — never both shapes. Splitting a combined allowance in two invents a deadline that does not exist. If the document does not make the shape clear, omit freeTimeModel rather than assuming.
- A document may carry two bills of lading. The carrier issues the master or ocean bill; a freight forwarder issues the house bill. Put each under its own name and never the house number under blNumber — they identify different contracts, and confusing them misroutes the shipment.
- The house bill is labelled inconsistently: "House BL", "House B/L", "HOUSE BILL OF LADING", "HBL", "HB/L", "H B/L", sometimes only as a column heading beside "Ocean Bill of Lading" or "Master B/L", and sometimes in a table where the heading row and the value row are far apart. Read it wherever it appears.
- A booking made directly with the carrier has no house bill at all. That is the ordinary case, not a failure to find one: do not list houseBlNumber, and never repeat the master number there.`;

export interface ClaudeExtractionResult {
  fields: Record<string, ExtractedField<unknown>>;
  model: string;
  usage: { input: number; output: number };
}

/**
 * Turn the model's JSON into engine fields.
 *
 * Separate from the request so the mapping is testable without spending money
 * or needing a key — and the mapping is where the safety decisions live.
 */
export function toFields(
  json: string, fileName: string, now: string,
): Record<string, ExtractedField<unknown>> {
  const parsed = JSON.parse(json) as {
    fields?: Array<{ name?: string; value?: unknown; confidence?: number }>;
  };

  const fields: Record<string, ExtractedField<unknown>> = {};
  for (const entry of parsed.fields ?? []) {
    // An unknown name is dropped rather than stored: the form has nowhere to
    // put it, and a field nothing renders is a field nobody checks.
    if (!entry?.name || !(entry.name in FIELDS)) continue;
    if (entry.value === null || entry.value === undefined || entry.value === "") continue;
    // A value that arrives without a score is treated as unverified rather
    // than certain: 0 routes it to a human, where 1 would let a silent
    // omission read as agreement.
    fields[entry.name] = field(entry.value, fileName, entry.confidence ?? 0, now);
  }
  return fields;
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

  const text = response.content.find((b) => b.type === "text");
  const fields = toFields(text && "text" in text ? text.text : "{}", document.fileName, now);

  return {
    fields,
    model: response.model,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}
