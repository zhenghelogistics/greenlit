import { wouldOverwrite } from "@greenlit/engine";
import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";
import { getRepository } from "../../../../../lib/greenlit";

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
    /** Ask what this would replace, and write nothing. */
    preview?: boolean;
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

  // What this would replace, named one container at a time.
  //
  // Applying one container's terms to the rest is the point of the control.
  // Silently replacing a figure somebody entered by hand is not, and it is
  // invisible afterwards: the containers all agree, which is exactly what the
  // control is for, so nothing looks wrong.
  //
  // A general "this will overwrite existing values" is a warning nobody reads.
  // Naming the boxes lets the question be asked properly.
  const containers = await getRepository().listContainersForImportJob(id);
  const incoming = {
    freeTimeModel: model,
    demurrageFreeDays: body.demurrageFreeDays ?? null,
    detentionFreeDays: body.detentionFreeDays ?? null,
    combinedFreeDays: body.combinedFreeDays ?? null,
  };
  const replaced = wouldOverwrite(
    containers.filter((c) => ids.includes(c.containerId)) as unknown as Array<Record<string, unknown>>,
    ["freeTimeModel", "demurrageFreeDays", "detentionFreeDays", "combinedFreeDays"],
    incoming,
    (c) => String(c.containerNumber ?? c.containerRef ?? c.containerId),
  );

  // Asked, not refused: the containers were named deliberately, and the answer
  // to "yes, replace them" has to be able to be yes.
  if (body.preview) return Response.json({ replaced });

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
