import { authorize, badRequest, readJson, runCommand } from "../../../../../../lib/command";

/**
 * §29. Correct a container's details.
 *
 * Only what someone typed. Container status, location and the free-time
 * countdown are computed from these and stay unwritable (§54); the free-time
 * terms themselves have their own route, because §34 decides which figures
 * apply from the model and will not store two shapes at once.
 */
export async function PATCH(request: Request, ctx: {
  params: Promise<{ id: string; containerId: string }>;
}) {
  const { id, containerId } = await ctx.params;
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return badRequest("A JSON body is required");

  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  const AMENDABLE = [
    "containerNumber", "containerSize", "sealNumber",
    "grossWeight", "packageCount", "packageType", "emptyReturnYard", "triAxle",
    // The customer's date. The controller's planned date has its own route,
    // which waits for release and discharge.
    "requestedDeliveryDate", "requestedDeliveryTime", "deliveryInstructions", "extraStops",
    "deliveryCompany", "deliveryAddress",
    // Export: the box's own weight and where it is stuffed, and its size.
    "grossWeightKg", "stuffingLocation", "sizeType",
  ] as const;

  // Further stops: a list of company, address and note, each text.
  if ("extraStops" in body) {
    const stops = body.extraStops;
    const isStop = (st: unknown) => {
      if (!st || typeof st !== "object") return false;
      const { company, address, note } = st as { company?: unknown; address?: unknown; note?: unknown };
      return typeof company === "string" && typeof address === "string"
        && (note === undefined || note === null || typeof note === "string");
    };
    const ok = Array.isArray(stops) && stops.every(isStop);
    if (!ok) return badRequest("extraStops must be a list of { company, address, note }.");
    body.extraStops = (stops as { company: string; address: string; note?: string | null }[])
      .filter((st) => st.address.trim())
      .map((st) => ({ company: st.company.trim(), address: st.address.trim(), note: st.note?.trim() || null }));
  }

  const changes: Record<string, unknown> = {};
  for (const field of AMENDABLE) {
    if (!(field in body)) continue;
    const value = body[field];
    changes[field] = value === "" || value == null ? null : value;
  }
  if (Object.keys(changes).length === 0) {
    return badRequest(
      `Nothing amendable was sent. This accepts: ${AMENDABLE.join(", ")}. `
      + "Free-time terms have their own route, and status is computed.",
    );
  }

  // §46. An export container is a different record with different amendable
  // fields, so the job decides which one is being corrected.
  return runCommand(id, async (repo) => {
    if (await repo.getExportJob(id)) {
      // Number, seal and tare are the box's identity, captured together under
      // §39 once the empty is collected. They were sent and never written.
      if (["containerNumber", "sealNumber", "tareWeightKg"].some((k) => k in body)) {
        const existing = (await repo.listContainersForExportJob(id))
          .find((c) => c.exportContainerId === containerId);
        await repo.captureContainerIdentity(containerId, {
          containerNumber: String(body.containerNumber ?? existing?.containerNumber ?? "").trim().toUpperCase(),
          sealNumber: String(body.sealNumber ?? existing?.sealNumber ?? "").trim().toUpperCase(),
          tareWeightKg: Number(body.tareWeightKg ?? existing?.tareWeightKg ?? 0),
        }, auth.displayName);
      }
      await repo.amendExportContainer(containerId, {
        // The screen sends containerSize; the export record calls it sizeType.
        // Reading only the second dropped every size change.
        sizeType: (changes.sizeType ?? changes.containerSize) as string | undefined,
        stuffingLocation: changes.stuffingLocation as string | null | undefined,
        // Handover is refused without it, and nothing could set it.
        grossWeightKg: changes.grossWeightKg === undefined
          ? undefined : Number(changes.grossWeightKg),
      }, auth.displayName);
      return;
    }
    await repo.amendContainer(containerId, changes, auth.displayName);
  });
}

/** §29. Remove a container that should not be on the job. */
export async function DELETE(request: Request, ctx: {
  params: Promise<{ id: string; containerId: string }>;
}) {
  const { id, containerId } = await ctx.params;
  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  return runCommand(id, async (repo) => {
    if (await repo.getExportJob(id)) {
      await repo.removeExportContainer(containerId, auth.displayName);
      return;
    }
    await repo.removeContainerFromJob(containerId, auth.displayName);
  });
}
