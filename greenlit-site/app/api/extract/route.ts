import { ingest, extractionStrategy } from "@/lib/ingest.mjs";
import { extractWithClaude, claudeExtractionAvailable } from "@/lib/extract-claude";

/**
 * POST /api/extract — read a document into fields.
 *
 * Picks the cheapest rung that can read the file: a text layer goes to the
 * offline parser, and only a scan or a photograph reaches the model. Fields
 * come back with provenance and confidence attached; nothing here writes to a
 * job. Deciding what to keep is the caller's job, and goes through
 * reconcileExtraction() so §12's critical-field protection still applies.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Attach a file as 'file'" }, { status: 400 });
  }

  let document;
  try {
    document = await ingest(file);
  } catch (cause) {
    return Response.json(
      { error: `Could not read ${file.name}: ${(cause as Error).message}` },
      { status: 415 },
    );
  }

  const strategy = extractionStrategy(document);
  if (!claudeExtractionAvailable()) {
    return Response.json({
      error: "Reading documents requires ANTHROPIC_API_KEY to be configured.",
      strategy,
      fileName: file.name,
    }, { status: 503 });
  }

  // A scanned PDF has no text layer and ingest() does not rasterise, so
  // reading it used to need OCR — a rung that loses the layout and mangles
  // handwriting before the fields are ever parsed. Sending the PDF itself
  // avoids both: the API renders and reads it, so the model sees the page as
  // printed rather than an OCR engine's guess at it.
  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  const pdfBase64 = isPdf
    ? Buffer.from(await file.arrayBuffer()).toString("base64")
    : undefined;

  const images = [];
  for (const page of document.pages) {
    const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(page.imageDataUrl ?? "");
    if (match) images.push({ mediaType: match[1], base64: match[2] });
  }

  try {
    const result = await extractWithClaude({
      fileName: file.name,
      pdfBase64,
      images,
      // The text layer, when there is one, is sent alongside the page rather
      // than instead of it: it is exact where rendering is interpretation.
      text: document.text || undefined,
    });
    return Response.json({
      fileName: file.name,
      strategy,
      pages: document.pages?.length ?? 1,
      fields: result.fields,
      model: result.model,
      usage: result.usage,
    });
  } catch (cause) {
    return Response.json({ error: (cause as Error).message }, { status: 502 });
  }
}
