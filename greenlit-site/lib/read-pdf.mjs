const DEFAULT_TIMEOUT_MS = 30_000;

function report(onProgress, message) {
  if (typeof onProgress === "function") onProgress(message);
}

export async function readPdfText(file, { onProgress, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!file) throw new Error("Choose a PDF to continue.");
  if (file.size > 15 * 1024 * 1024) throw new Error("This PDF is larger than 15 MB. Choose a smaller arrival notice.");
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Greenlit can process PDF files only in this proof of concept.");
  }

  report(onProgress, "Loading the PDF reader");
  const [pdfjs] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    // Importing the worker module directly registers WorkerMessageHandler on
    // globalThis. PDF.js can then use its deterministic in-process worker path
    // without relying on a generated asset URL that differs by host/runtime.
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  ]);

  report(onProgress, `Opening ${file.name}`);
  const data = new Uint8Array(await file.arrayBuffer());
  let loadingTask;
  let timeoutId;

  try {
    const extraction = async () => {
      loadingTask = pdfjs.getDocument({ data });
      const document = await loadingTask.promise;
      const pages = [];

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        report(onProgress, `Reading page ${pageNumber} of ${document.numPages}`);
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`).join(""));
        page.cleanup();
      }

      const text = pages.join("\n\n").trim();
      if (!text) {
        throw new Error("No selectable text was found. This proof of concept cannot read scanned-image PDFs yet.");
      }
      return { text, pages: document.numPages };
    };

    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("PDF extraction took longer than 30 seconds. Try the file again or use a smaller selectable-text PDF."));
      }, timeoutMs);
    });

    return await Promise.race([extraction(), timeout]);
  } finally {
    clearTimeout(timeoutId);
    if (loadingTask) await loadingTask.destroy().catch(() => {});
  }
}
