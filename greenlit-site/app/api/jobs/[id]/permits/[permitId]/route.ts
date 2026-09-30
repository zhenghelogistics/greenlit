import { authorize, badRequest, readJson } from "../../../../../../lib/command";
import { getJobService, getRepository, jsonError } from "../../../../../../lib/greenlit";
import { refusePermitSave } from "@greenlit/engine";

/**
 * §24. Which containers this permit covers.
 *
 * The list replaces whatever it covered before, because "copy to selected"
 * states the intended relationship for the whole permit: a container the
 * controller has just unticked must stop being covered, and an add-only call
 * could never say so.
 */
export async function PUT(request: Request, ctx: {
  params: Promise<{ permitId: string }>;
}) {
  try {
    const { permitId } = await ctx.params;
    const body = await readJson<{ containerIds?: string[] }>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("permit.confirm");
    if (!auth.ok) return auth.response;
    if (!Array.isArray(body.containerIds)) {
      return badRequest("containerIds must be a list, empty to cover nothing");
    }

    await getRepository().linkPermitToContainers(permitId, body.containerIds, auth.displayName);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}

/**
 * Correct a permit: its number, expiry, vessel/voyage or file.
 *
 * The demo reopens every permit for editing. Correcting one meant removing it
 * and adding it again, which lost which containers it covered. Refused on the
 * same grounds as a new permit: another sailing, or expiry not after the ETA.
 */
export async function PATCH(request: Request, ctx: {
  params: Promise<{ id: string; permitId: string }>;
}) {
  try {
    const { id, permitId } = await ctx.params;
    const body = await readJson<{
      permitNumber?: string | null; expiryDate?: string | null;
      permitVesselVoyage?: string | null; fileName?: string | null;
    }>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("permit.confirm");
    if (!auth.ok) return auth.response;

    const pick = (k: keyof typeof body) => (k in body ? (String(body[k] ?? "").trim() || null) : undefined);
    const changes = {
      permitNumber: pick("permitNumber"), expiryDate: pick("expiryDate"),
      permitVesselVoyage: pick("permitVesselVoyage"), fileName: pick("fileName"),
    };

    const repo = getRepository();
    const current = (await repo.listPermitsForJob(id)).find((p) => p.permitId === permitId);
    if (!current) return Response.json({ error: `Unknown permit ${permitId}` }, { status: 404 });
    const next = {
      ...current,
      ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)),
    };
    if (!next.permitNumber && !next.fileName) {
      return badRequest("Enter the permit number, or attach the permit.");
    }
    const shipment = (await getJobService().getJob(id))?.record as
      { vesselName?: string | null; voyageNumber?: string | null; eta?: string | null } | undefined;
    const refusal = refusePermitSave(next, {
      vesselName: shipment?.vesselName ?? null, voyageNumber: shipment?.voyageNumber ?? null,
      eta: shipment?.eta ?? null,
    });
    if (refusal) return badRequest(refusal);

    const permit = await repo.amendPermit(permitId, changes, auth.displayName);
    return Response.json({ permit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}

export async function DELETE(request: Request, ctx: {
  params: Promise<{ permitId: string }>;
}) {
  try {
    const { permitId } = await ctx.params;
    const auth = await authorize("permit.confirm");
    if (!auth.ok) return auth.response;

    await getRepository().removePermit(permitId, auth.displayName);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}
