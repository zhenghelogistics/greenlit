import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";

/**
 * §34. Apply one carrier's free-time terms to several containers at once.
 *
 * The terms come from the bill of lading, so they are the same for every box
 * on it far more often than not. Entering them eleven times is not only slow,
 * it is how they come to disagree — and two containers on one bill with
 * different last free days is a discrepancy nobody can resolve from the
 * paperwork, because the paperwork only ever said one thing.
 *
 * Scoped to the job for the same reason the bulk discharge is: a carrier's
 * terms belong to a booking, and reaching across jobs would apply one
 * carrier's allowance to another's containers.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{
    containerIds?: string[];
    freeTimeModel?: string;
    demurrageFreeDays?: number; detentionFreeDays?: number; combinedFreeDays?: number;
    freeTimeRemarks?: string;
  }>(request);
  if (!body) return badRequest("A JSON body is required");

  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  const ids = Array.isArray(body.containerIds) ? body.containerIds : [];
  if (ids.length === 0) return badRequest("Name the containers to apply these terms to.");

  const model = body.freeTimeModel;
  if (model !== "SPLIT" && model !== "COMBINED" && model !== "NOT_CONFIRMED") {
    return badRequest("freeTimeModel must be SPLIT, COMBINED or NOT_CONFIRMED");
  }
  // §34.3, checked once for the set rather than per container: the same
  // mismatch would otherwise be reported after some of them had been written.
  if (model === "COMBINED" && (body.demurrageFreeDays != null || body.detentionFreeDays != null)) {
    return badRequest("§34.3: a combined allowance is one pool. Send combinedFreeDays, not split figures.");
  }
  if (model === "SPLIT" && body.combinedFreeDays != null) {
    return badRequest("§34.3: split allowances are two clocks. Send demurrage and detention, not a combined figure.");
  }

  return runCommand(id, async (repo) => {
    for (const containerId of ids) {
      await repo.recordFreeTime(containerId, {
        freeTimeModel: model,
        demurrageFreeDays: body.demurrageFreeDays ?? null,
        // The dates are counted from the vessel ETA (§34.1), so only the
        // allowance travels. Copying a last free day across containers would
        // copy one box's arithmetic onto another's.
        demurrageLfd: null,
        detentionFreeDays: body.detentionFreeDays ?? null,
        detentionLfd: null,
        combinedFreeDays: body.combinedFreeDays ?? null,
        combinedLfd: null,
        freeTimeRemarks: body.freeTimeRemarks ?? null,
        dailyRate: null,
        currency: null,
      }, auth.displayName);
    }
  });
}
