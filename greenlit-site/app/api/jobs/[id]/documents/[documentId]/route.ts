import { currentPrincipal } from "../../../../../../lib/auth";
import { getRepository, jsonError } from "../../../../../../lib/greenlit";

/**
 * §10. A link to read the document, valid for five minutes.
 *
 * Minted on demand rather than stored. The bucket is private because these are
 * customers' commercial papers, and a stored link would outlive the reason
 * somebody was allowed to see it.
 */
export async function GET(_request: Request, ctx: {
  params: Promise<{ documentId: string }>;
}) {
  try {
    const { documentId } = await ctx.params;
    if (!await currentPrincipal()) {
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const url = await getRepository().documentUrl(documentId, 300);
    if (!url) {
      // The in-memory adapter has no file storage. Saying so beats a dead link.
      return Response.json(
        { error: "This deployment does not store the file itself." },
        { status: 503 },
      );
    }
    return Response.json({ url, expiresInSeconds: 300 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}
