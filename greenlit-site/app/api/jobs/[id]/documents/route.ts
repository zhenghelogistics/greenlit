import { suggestedDocumentType } from "@greenlit/engine";
import { authorize, badRequest } from "../../../../../lib/command";
import { currentPrincipal } from "../../../../../lib/auth";
import { getRepository, jsonError } from "../../../../../lib/greenlit";

/** §10. What has been filed against this job. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!await currentPrincipal()) {
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    }
    return Response.json({ documents: await getRepository().listDocumentsForJob(id) });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * §10. File a document against a job.
 *
 * Multipart, because the point is the bytes. The type is suggested from the
 * filename and confirmed by the uploader — carriers name files anything, and
 * offering a wrong type confidently is worse than offering none.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await authorize("document.upload");
    if (!auth.ok) return auth.response;

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return badRequest("Attach a file.");

    // 25MB, matching the bucket. Refusing here says so in words rather than
    // letting the upload fail halfway with a storage error.
    if (file.size > 25 * 1024 * 1024) {
      return badRequest("That file is over 25MB. Scanned notices are usually far smaller.");
    }

    const stored = await getRepository().storeDocument({
      jobId: id,
      documentType: String(form?.get("documentType") ?? "") || suggestedDocumentType(file.name),
      filename: file.name,
      source: String(form?.get("source") ?? "") || "MANUAL_UPLOAD",
      receivedFrom: String(form?.get("receivedFrom") ?? "") || null,
      containerId: String(form?.get("containerId") ?? "") || null,
    }, new Uint8Array(await file.arrayBuffer()), auth.displayName);

    return Response.json({ document: stored }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/needs a name|not a document type/.test(message)) return badRequest(message);
    return jsonError(error);
  }
}
