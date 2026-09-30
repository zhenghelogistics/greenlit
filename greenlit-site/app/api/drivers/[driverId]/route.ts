import { authorize, badRequest } from "../../../../lib/command";
import { getRepository, jsonError } from "../../../../lib/greenlit";

/**
 * Delete a driver who was never put on a trip.
 *
 * A driver named on a trip is on that trip's history, so is refused here and
 * taken out of use instead; the refusal says so.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ driverId: string }> }) {
  try {
    const { driverId } = await ctx.params;
    const auth = await authorize("movement.assign");
    if (!auth.ok) return auth.response;
    await getRepository().deleteDriver(driverId, auth.displayName);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/cannot be deleted/.test(message)) return badRequest(message);
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}
