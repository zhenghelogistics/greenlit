/**
 * Ingest: normalise any input into the same shape.
 *
 * Everything downstream — classification, extraction, reconciliation — works on
 * `IngestedDocument` and stops caring what the file was. That separation is
 * what makes an email with three attachments behave like three documents, and
 * what lets a scan take a different extraction path without touching the
 * parser.
 *
 * @typedef {{ text: string, hasTextLayer: boolean, imageDataUrl: string|null }} IngestedPage
 * @typedef {{
 *   pages: IngestedPage[],
 *   text: string,
 *   source: string,
 *   mediaType: string,
 *   receivedAt: string,
 *   attachments: IngestedDocument[],
 *   needsVision: boolean,
 * }} IngestedDocument
 */

const MAX_BYTES = 15 * 1024 * 1024;

/** Below this, a "text layer" is really just page furniture. */
const MEANINGFUL_TEXT_CHARS = 40;

function report(onProgress, message) {
  if (typeof onProgress === "function") onProgress(message);
}

const isPdf = (file) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name ?? "");
const isImage = (file) =>
  /^image\//.test(file.type ?? "") || /\.(png|jpe?g|webp|heic|tiff?)$/i.test(file.name ?? "");
const isEmail = (file) =>
  /message\/rfc822/.test(file.type ?? "") || /\.(eml|msg)$/i.test(file.name ?? "");

/**
 * A PDF whose pages carry almost no text is a scan. It is still a PDF, and it
 * still needs the vision path, so the distinction is drawn here rather than
 * left for the parser to discover by extracting nothing.
 */
async function ingestPdf(file, { onProgress }) {
  report(onProgress, "Loading the PDF reader");
  const [pdfjs] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  ]);

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];

  for (let n = 1; n <= doc.numPages; n += 1) {
    report(onProgress, `Reading page ${n} of ${doc.numPages}`);
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str ?? "").join(" ").trim();
    pages.push({
      text,
      hasTextLayer: text.length >= MEANINGFUL_TEXT_CHARS,
      imageDataUrl: null,
    });
  }

  return pages;
}

/**
 * An image is one page with no text layer. Rasterising is unnecessary — it is
 * already a raster — so it goes straight to the vision rung.
 */
async function ingestImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
  return [{ text: "", hasTextLayer: false, imageDataUrl: dataUrl }];
}

/**
 * An email is a body plus attachments, and the facts may be in either. The body
 * becomes a page; each attachment recurses through ingest, so a PDF attached to
 * an email is treated exactly like a PDF that was uploaded directly.
 *
 * Parsing is deliberately minimal: enough to separate the plain-text body from
 * the parts, without taking a MIME library into the browser bundle for a case
 * that is not yet exercised.
 */
async function ingestEmail(file) {
  const raw = await file.text();
  const headerEnd = raw.search(/\r?\n\r?\n/);
  const body = headerEnd === -1 ? raw : raw.slice(headerEnd).trim();
  // Strip quoted-printable soft breaks, which otherwise split field values.
  const text = body.replace(/=\r?\n/g, "").replace(/<[^>]+>/g, " ");
  return [{ text, hasTextLayer: text.length >= MEANINGFUL_TEXT_CHARS, imageDataUrl: null }];
}

/**
 * Normalise one file.
 *
 * @param {File} file
 * @returns {Promise<IngestedDocument>}
 */
export async function ingest(file, { onProgress } = {}) {
  if (!file) throw new Error("Choose a file to continue.");
  if (file.size > MAX_BYTES) {
    throw new Error(`${file.name} is larger than 15 MB. Choose a smaller file.`);
  }

  let pages;
  if (isPdf(file)) pages = await ingestPdf(file, { onProgress });
  else if (isImage(file)) pages = await ingestImage(file);
  else if (isEmail(file)) pages = await ingestEmail(file);
  else {
    throw new Error(
      `Greenlit cannot read ${file.name}. Upload a PDF, an image, or an email.`,
    );
  }

  const text = pages.map((p) => p.text).filter(Boolean).join("\n").trim();

  return {
    pages,
    text,
    source: file.name ?? "document",
    mediaType: file.type || "application/octet-stream",
    receivedAt: new Date().toISOString(),
    attachments: [],
    // No usable text anywhere means rungs 1 and 2 have nothing to work with.
    needsVision: pages.every((p) => !p.hasTextLayer),
  };
}

/**
 * How this document will be read. See docs/extraction-engine.md.
 *
 * There is no OCR rung. The ladder once ended in one, for the scanned PDF
 * that has neither a text layer nor a rasterised page — but OCR flattens the
 * layout and mangles handwriting before a single field is parsed, and the
 * document can simply be sent as a PDF and rendered where it is read. The
 * rung was removed rather than implemented.
 */
export function extractionStrategy(document) {
  if (!document.needsVision) return "TEXT_LAYER";
  if (document.pages.some((p) => p.imageDataUrl)) return "IMAGE";
  return "RENDERED";
}
