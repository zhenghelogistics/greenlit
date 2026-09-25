import { checkPermit, permitNumberChanged, permitNumberLooksValid } from "@greenlit/engine";
import { authorize, badRequest, readJson } from "../../../../../lib/command";
import { currentPrincipal } from "../../../../../lib/auth";
import { getRepository, getJobService, jsonError } from "../../../../../lib/greenlit";

/**
 * §24. The permits on a shipment.
 *
 * Each one comes back with its verdict computed against the job as it stands
 * right now, never as a stored column. That is what makes amending a voyage
 * from 256S to 257S turn its permits amber without anyone touching them — a
 * stored verdict would still be green, which is the failure the check exists
 * to catch.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!await currentPrincipal()) {
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const job = await getJobService().getJob(id);
    if (!job) return Response.json({ error: `Unknown job ${id}` }, { status: 404 });

    // §24 permits are import permits: they authorise goods into Singapore. An
    // export job has an export clearance instead, which is a different
    // document with different rules, so this is an empty answer rather than a
    // wrong one.
    if (job.domain !== "IMPORT") {
      return Response.json({ permits: [], uncoveredContainers: [] });
    }

    const permits = await getRepository().listPermitsForJob(id);
    // Everything under `record` was typed by someone; everything outside it
    // was computed (§56). The sailing a permit is checked against is the
    // former.
    const stored = job.record as { vesselName?: string | null;
      voyageNumber?: string | null; eta?: string | null };
    const sailing = {
      vesselName: stored.vesselName ?? null,
      voyageNumber: stored.voyageNumber ?? null,
      eta: stored.eta ?? null,
    };

    return Response.json({
      permits: permits.map((permit) => ({ ...permit, verdict: checkPermit(permit, sailing) })),
      // Which containers nothing covers. A warning rather than a gate: Portnet
      // release is what stops a collection, and an incomplete permit must stay
      // visible without blocking work that is allowed to continue.
      uncoveredContainers: (job.storedContainers as Array<{ containerId: string }>)
        .map((c) => c.containerId)
        .filter((cid) => !permits.some((p) => p.linkedContainerIds.includes(cid))),
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Record a permit against the shipment. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<{
      permitNumber?: string; expiryDate?: string;
      permitVesselVoyage?: string; fileName?: string; containerIds?: string[];
    }>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("permit.confirm");
    if (!auth.ok) return auth.response;

    // A permit with neither a number nor a file is not a permit, it is an
    // empty row that would sit on the job looking like one.
    if (!body.permitNumber?.trim() && !body.fileName?.trim()) {
      return badRequest("Enter the permit number, or attach the permit.");
    }

    // What this job's permit number was before this call, so a replacement can
    // be pointed out. A permit number that changes is ordinary — an amended
    // permit is issued with a new one — and it is also how the number on the
    // paperwork at the gate stops matching the number on the job.
    const previous = (await getRepository().listPermitsForJob(id))
      .map((permit) => permit.permitNumber)
      .filter((number): number is string => Boolean(number));

    const permit = await getRepository().recordPermit(id, {
      permitNumber: body.permitNumber ?? null,
      expiryDate: body.expiryDate ?? null,
      permitVesselVoyage: body.permitVesselVoyage ?? null,
      fileName: body.fileName ?? null,
      containerIds: body.containerIds ?? [],
    }, auth.displayName);

    const job = await getJobService().getJob(id);
    const stored = (job?.record ?? {}) as { vesselName?: string | null;
      voyageNumber?: string | null; eta?: string | null };
    return Response.json({
      permit: {
        ...permit,
        verdict: checkPermit(permit, {
          vesselName: stored.vesselName ?? null,
          voyageNumber: stored.voyageNumber ?? null,
          eta: stored.eta ?? null,
        }),
      },
      // Said once, here, rather than refusing: Customs can issue a shape we
      // have not seen, so an unfamiliar number is worth a second look and not
      // worth losing the permit over.
      // Two different second looks, so neither hides the other: an unfamiliar
      // shape, and a number that has replaced one already on this job.
      warning: body.permitNumber && !permitNumberLooksValid(body.permitNumber)
        ? "That is not the usual permit-number shape. Worth checking against the permit itself."
        : null,
      replaces: previous.length === 1
        ? permitNumberChanged(previous[0], body.permitNumber ?? null)
        : null,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}
