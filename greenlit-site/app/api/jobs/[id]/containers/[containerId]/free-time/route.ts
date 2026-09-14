import { authorize, badRequest, readJson, runCommand } from "../../../../../../../lib/command";

/**
 * §34. Confirm the carrier's free-time terms for one container.
 *
 * The one §34 value a person supplies: what the carrier gives is a fact about
 * the booking, not something derivable from it. Every countdown, every charge
 * warning and every "last free day" on screen follows from this.
 *
 * The model decides which figures are accepted. Sending split figures under a
 * combined allowance is refused rather than quietly ignored, because a caller
 * that believes it stored a demurrage date should be told it did not.
 */
export async function POST(request: Request, ctx: {
  params: Promise<{ id: string; containerId: string }>;
}) {
  const { id, containerId } = await ctx.params;
  const body = await readJson<{
    actor?: string; freeTimeModel?: string;
    demurrageFreeDays?: number; demurrageLfd?: string;
    detentionFreeDays?: number; detentionLfd?: string;
    combinedFreeDays?: number; combinedLfd?: string;
    freeTimeRemarks?: string;
  }>(request);

  if (!body?.actor) return badRequest("actor is required; §13 forbids anonymous changes");
  const auth = await authorize(body.actor, "job.edit");
  if (!auth.ok) return auth.response;

  const model = body.freeTimeModel;
  if (model !== "SPLIT" && model !== "COMBINED" && model !== "NOT_CONFIRMED") {
    return badRequest("freeTimeModel must be SPLIT, COMBINED or NOT_CONFIRMED");
  }

  if (model === "COMBINED" && (body.demurrageFreeDays != null || body.detentionFreeDays != null)) {
    return badRequest(
      "§34.3: a combined allowance is one pool. Send combinedFreeDays, not split figures.",
    );
  }
  if (model === "SPLIT" && body.combinedFreeDays != null) {
    return badRequest(
      "§34.3: split allowances are two clocks. Send demurrage and detention, not a combined figure.",
    );
  }

  // runCommand returns the job after applying, so it needs the job id. Passing
  // the container id applied the change and then answered 404, which reads as
  // "nothing happened" while something had.
  return runCommand(id, (repo) =>
    repo.recordFreeTime(containerId, {
      freeTimeModel: model,
      demurrageFreeDays: body.demurrageFreeDays ?? null,
      demurrageLfd: body.demurrageLfd ?? null,
      detentionFreeDays: body.detentionFreeDays ?? null,
      detentionLfd: body.detentionLfd ?? null,
      combinedFreeDays: body.combinedFreeDays ?? null,
      combinedLfd: body.combinedLfd ?? null,
      freeTimeRemarks: body.freeTimeRemarks ?? null,
    }, auth.displayName));
}
