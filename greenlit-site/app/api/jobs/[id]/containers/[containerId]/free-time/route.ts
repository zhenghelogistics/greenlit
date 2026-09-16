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
  const body = await readJson<{ freeTimeModel?: string;
    demurrageFreeDays?: number; demurrageLfd?: string;
    detentionFreeDays?: number; detentionLfd?: string;
    combinedFreeDays?: number; combinedLfd?: string;
    freeTimeRemarks?: string;
    dailyRate?: number | null; currency?: string | null;
  }>(request);
  if (!body) return badRequest("A JSON body is required");
  const auth = await authorize("job.edit");
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

  // §34.2. Refused here rather than left to the database, so a caller that
  // sent half the pair is told which half, in a sentence about rates instead
  // of a constraint name.
  const rate = body.dailyRate ?? null;
  const currency = body.currency ?? null;
  if ((rate === null) !== (currency === null)) {
    return badRequest("A daily rate needs a currency, and a currency needs a rate. Send both, or neither.");
  }
  if (rate !== null && !(rate >= 0)) {
    return badRequest("A daily rate cannot be negative.");
  }
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
    return badRequest("Currency is a three-letter code, e.g. SGD.");
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
      dailyRate: rate,
      currency,
    }, auth.displayName));
}
