import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";
import { getJobService } from "../../../../../lib/greenlit";

/**
 * Set the controller's planned delivery date on several containers at once.
 *
 * The customer's requested date is entered at creation. Operations,
 * 29 September 2026: once Portnet release and discharge are done, the
 * controller can arrange to send the box earlier than asked — so this is
 * refused for a box that is not yet released and discharged, in the same
 * words the Plan button uses.
 *
 * Operations, 29 September 2026: the same date for every box on the job, or
 * for the boxes picked, so a staggered delivery (five on the 15th, five on the
 * 16th) is two actions rather than ten containers opened one by one.
 *
 * Scoped to the job for the same reason bulk discharge is: a date meant for
 * one shipment must not reach another's containers. Each box records its own
 * audit line on the job's log.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{ containerIds?: unknown; plannedDeliveryDate?: unknown }>(request);
  if (!body) return badRequest("A JSON body is required");

  const auth = await authorize("movement.schedule");
  if (!auth.ok) return auth.response;

  const ids = Array.isArray(body.containerIds) ? body.containerIds.map(String).filter(Boolean) : [];
  if (ids.length === 0) return badRequest("Choose the containers to date.");
  const date = body.plannedDeliveryDate === null || body.plannedDeliveryDate === ""
    ? null : String(body.plannedDeliveryDate ?? "");
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return badRequest("The delivery date must be a date, YYYY-MM-DD.");
  }

  return runCommand(id, async (repo) => {
    // Only this job's boxes, whatever was sent.
    const view = await getJobService().getJob(id);
    const onJob = new Map((view?.containers ?? []).map((c) => [c.containerId, c]));
    const stray = ids.filter((c) => !onJob.has(c));
    if (stray.length) throw new Error(`Unknown container ${stray[0]} on this job`);
    const waiting = ids.map((c) => onJob.get(c)!).filter((c) => !c.canPlanCollection);
    if (waiting.length) {
      throw new Error(`${waiting[0]!.containerNumber ?? "A container"}: `
        + `${waiting[0]!.planBlockedReason ?? "not ready to plan"}. `
        + "The delivery date can be brought forward once it is released and discharged.");
    }
    for (const containerId of ids) {
      await repo.amendContainer(containerId, { plannedDeliveryDate: date }, auth.displayName);
    }
  });
}
