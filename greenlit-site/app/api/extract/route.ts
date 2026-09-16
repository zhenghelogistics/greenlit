import { authorize } from "@/lib/command";
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

/**
 * Five minutes, which is what the plan allows.
 *
 * It was sixty seconds, and four documents measured at ninety-two — so a batch
 * of four timed out on a deployment that had five minutes available and was
 * only ever asking for one.
 *
 * This is the ceiling, not the target. The batch is still chunked well inside
 * it, because a request that uses its whole allowance is one slow document
 * away from failing, and a timeout reads to an operator as "it broke" rather
 * than "that was too many".
 */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  // Reading a document costs money on every call, so this is gated in its own
  // right and not only by the middleware: a route that spends is a route worth
  // checking twice.
  const auth = await authorize("job.create");
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "Attach a file as 'file'" }, { status: 400 });
  }

  // Twenty notices is a morning's post, and each is an independent read, so
  // they go at once and the batch takes about as long as its slowest document
  // rather than the sum of all of them.
  //
  // A cap, because the model is paid per call and a runaway selection should
  // cost a refusal rather than a bill.
  if (files.length > MAX_DOCUMENTS_PER_BATCH) {
    return Response.json({
      error: `${files.length} documents in one request would run past the time limit. `
        + `Send up to ${MAX_DOCUMENTS_PER_BATCH} at a time.`,
      maxPerRequest: MAX_DOCUMENTS_PER_BATCH,
    }, { status: 400 });
  }

  // One file answers exactly as it always has. Several answer as a list, so a
  // caller that sends one never has to learn a second shape.
  if (files.length > 1) {
    const documents = await Promise.all(files.map(async (f) => {
      try {
        return await readOne(f);
      } catch (cause) {
        // One unreadable scan must not lose the other nineteen. It comes back
        // named, with its reason, and the operator decides.
        return { fileName: f.name, error: (cause as Error).message };
      }
    }));
    return Response.json({ documents });
  }

  const file = files[0]!;
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
      containers: result.containers,
      model: result.model,
      usage: result.usage,
    });
  } catch (cause) {
    return Response.json({ error: (cause as Error).message }, { status: 502 });
  }
}

/**
 * How many documents one request will read.
 *
 * Measured rather than guessed. A single notice ranges from 12.6s to 92.4s
 * depending on how much of it is prose, and two together took 95.5s — barely
 * more than the slowest alone. Documents are read in parallel, so a chunk
 * costs its slowest member, not the sum.
 *
 * Five against a 300-second ceiling is roughly three times the headroom on the
 * worst document seen. That margin is the point: a request that uses its whole
 * allowance is one unusual document away from a timeout, and a timeout reads
 * to an operator as "it broke" rather than "that was too many at once".
 *
 * A morning's post still goes in one go — the browser sends it in chunks of
 * this size and shows each landing. The limit lives here as well as there
 * because a caller that ignores it should get a refusal, not a gateway error.
 */
const MAX_DOCUMENTS_PER_BATCH = 5;

/**
 * Read one document, the same way the single-file path does.
 *
 * Lifted so the batch path cannot drift from it: the scanned-PDF handling and
 * the text-layer decision are the parts most likely to be got subtly wrong
 * twice.
 */
async function readOne(file: File) {
  const document = await ingest(file);
  const strategy = extractionStrategy(document);

  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  const pdfBase64 = isPdf
    ? Buffer.from(await file.arrayBuffer()).toString("base64")
    : undefined;

  const images = [];
  for (const page of document.pages) {
    const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(page.imageDataUrl ?? "");
    if (match) images.push({ mediaType: match[1], base64: match[2] });
  }

  const result = await extractWithClaude({
    fileName: file.name,
    pdfBase64,
    images,
    text: document.text || undefined,
  });

  return {
    fileName: file.name,
    strategy,
    pages: document.pages?.length ?? 1,
    fields: result.fields,
    containers: result.containers,
    model: result.model,
    usage: result.usage,
  };
}
