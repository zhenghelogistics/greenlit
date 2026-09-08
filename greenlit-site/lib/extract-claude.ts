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
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    containerNumber: { type: ["string", "null"], description: "ISO 6346, 4 letters + 7 digits, e.g. HLXU1234567" },
    blNumber: { type: ["string", "null"], description: "Bill of lading number" },
    bookingReference: { type: ["string", "null"] },
    carrier: { type: ["string", "null"], description: "Shipping line, e.g. Hapag-Lloyd" },
    vesselName: { type: ["string", "null"] },
    voyage: { type: ["string", "null"] },
    eta: { type: ["string", "null"], description: "Arrival date as YYYY-MM-DD" },
    portOfDischarge: { type: ["string", "null"] },
    deliveryAddress: { type: ["string", "null"] },
    emptyReturnYard: { type: ["string", "null"] },
    demurrageFreeDays: { type: ["integer", "null"] },
    detentionFreeDays: { type: ["integer", "null"] },
    permitNumber: { type: ["string", "null"] },
    vgm: { type: ["number", "null"], description: "Verified gross mass in kg" },
    confidence: {
      type: "object",
      additionalProperties: false,
      description: "Per-field confidence 0-1. Required for every field you returned non-null.",
      properties: Object.fromEntries(
        ["containerNumber", "blNumber", "bookingReference", "carrier", "vesselName", "voyage",
         "eta", "portOfDischarge", "deliveryAddress", "emptyReturnYard", "demurrageFreeDays",
         "detentionFreeDays", "permitNumber", "vgm"].map((k) => [k, { type: "number" }]),
      ),
      required: [],
    },
  },
  required: ["confidence"],
} as const;

const SYSTEM = `You read shipping documents for a Singapore haulier and return structured fields.

Documents range from a clean carrier PDF to a phone photograph of a handwritten note. Read what is on the page and nothing else.

Rules:
- A field not present on the page is null. Never infer, complete, or guess a value from context or from what is typical. A blank prompts a human to check; a wrong value does not.
- Never repair a value into what it "should" be. If a container number is smudged and you can only read HLXU12345??, return null rather than a completed guess.
- Give each non-null field a confidence between 0 and 1 reflecting how clearly you could read it. Clean printed text is high. Handwriting, a skewed photo, or a partly obscured field is low. Be honest — a low score routes the field to a human, which is the correct outcome when you are unsure.
- Dates as YYYY-MM-DD. If a date is ambiguous between formats (03/04/2026), return null rather than picking one.
- Container numbers are 4 letters then 7 digits, no spaces.`;

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
  const parsed = JSON.parse(json) as
    Record<string, unknown> & { confidence?: Record<string, number> };
  const scores = parsed.confidence ?? {};

  const fields: Record<string, ExtractedField<unknown>> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "confidence" || value === null || value === undefined) continue;
    // A value returned without a confidence score is treated as unverified
    // rather than certain. Defaulting to 0 routes it to a human; defaulting to
    // 1 would let a silent omission read as agreement.
    fields[key] = field(value, fileName, scores[key] ?? 0, now);
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
