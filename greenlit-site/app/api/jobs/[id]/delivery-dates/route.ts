import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";

/**
 * Set the delivery date on several containers of one job at once.
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
    const onJob = new Set((await repo.listContainersForImportJob(id)).map((c) => c.containerId));
    const stray = ids.filter((c) => !onJob.has(c));
    if (stray.length) throw new Error(`Unknown container ${stray[0]} on this job`);
    for (const containerId of ids) {
      await repo.amendContainer(containerId, { plannedDeliveryDate: date }, auth.displayName);
    }
  });
}
