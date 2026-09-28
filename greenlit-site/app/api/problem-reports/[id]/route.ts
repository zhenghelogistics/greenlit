import { authorize, badRequest, readJson } from "../../../../lib/command";
import { getRepository, jsonError } from "../../../../lib/greenlit";

/**
 * Move a report along, and say what happened to it.
 *
 * The reason is required for anything but NEW. Closing without one is how the
 * same fault is reported again in three months with nobody able to say what
 * became of the first.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("masterData.manage");
    if (!auth.ok) return auth.response;

    const status = String(body.status ?? "");
    if (!["NEW", "TRIAGED", "FIXED", "DECLINED"].includes(status)) {
      return badRequest("A status must be NEW, TRIAGED, FIXED or DECLINED.");
    }

    await getRepository().resolveProblemReport(
      id, status as never, String(body.resolution ?? ""), auth.displayName);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Say what happened/.test(message)) return badRequest(message);
    return jsonError(error);
  }
}
