import { authorize, badRequest, readJson } from "../../../../lib/command";
import { getJobService, getRepository, jsonError } from "../../../../lib/greenlit";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = await getJobService().getJob(id);
    if (!job) return Response.json({ error: `Unknown job ${id}` }, { status: 404 });
    return Response.json({ job });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * §30. Correct the facts on a job after it has been created.
 *
 * The screen has let someone edit these since the beginning; nothing was ever
 * written down. A controller amended a vessel, watched it change, reloaded,
 * and found the old one — which is worse than not offering the edit, because
 * they believed it.
 *
 * Only stored facts pass through here. Status, location, next action and
 * blocking reason are computed from these and stay unwritable (§54).
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("job.edit");
    if (!auth.ok) return auth.response;

    // A caller sending only unknown keys has misunderstood something, and
    // silently doing nothing would let them go on misunderstanding it.
    const changes: Record<string, string | null> = {};
    for (const field of AMENDABLE) {
      if (!(field in body)) continue;
      const value = body[field];
      changes[field] = value == null || value === "" ? null : String(value).trim();
    }
    if (Object.keys(changes).length === 0) {
      return badRequest(
        `Nothing amendable was sent. This accepts: ${AMENDABLE.join(", ")}. `
        + "Status and next action are computed and cannot be set.",
      );
    }

    await getRepository().amendJob(id, changes, auth.displayName);
    const job = await getJobService().getJob(id);
    if (!job) return Response.json({ error: `Unknown job ${id}` }, { status: 404 });
    return Response.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}

/**
 * What may be corrected, named once.
 *
 * Dates are deliberately absent: §30 wants a reason recorded against a moved
 * ETA, and that has its own path.
 */
const AMENDABLE = [
  "blNumber", "houseBlNumber", "vesselName", "voyageNumber",
  "deliveryAddress", "terminal", "emptyReturnYard",
  "shipper", "bookingReference", "exportClearanceReference",
  "emptyCollectionYard", "vesselClosingAt",
] as const;
