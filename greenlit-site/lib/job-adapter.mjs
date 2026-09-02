// Extracted from the control tower component so it can be unit-tested.
// Pure data mapping: API shape in, screen shape out. No JSX, no React.

const WAITING_LABEL_API = { US: "Us", CUSTOMER: "Customer", CARRIER: "Carrier", NOBODY: "Nobody" };

/**
 * Maps a DerivedJobView from the API into the shape these screens consume.
 *
 * Two halves, deliberately kept apart:
 *   - stored facts come from `record` and `storedContainers`
 *   - `derived` carries the engine's answers, which the accessors above prefer
 *
 * Nothing here recomputes a status. If a value is derived, it was derived on
 * the server (§56).
 */
export function jobFromApi(view) {
  const r = view.record ?? {};
  const stored = view.storedContainers ?? [];
  const first = stored[0] ?? {};
  const isImport = view.domain === "IMPORT";

  return {
    id: view.jobNumber,
    type: isImport ? "Import" : "Export",
    customer: view.customer,
    createdDate: (r.createdAt ?? "").slice(0, 10),
    booking: r.bookingReference ?? r.blNumber ?? "",
    vessel: [r.vesselName, r.voyageNumber].filter(Boolean).join(" / "),
    infoComplete: view.mandatoryComplete,
    missingInformation: view.missingInformation ?? [],
    cmsCompleted: r.cmsStatus === "COMPLETED" || r.cmsStatus === "NOT_REQUIRED",
    emptyYard: r.emptyCollectionYard ?? "",
    deliveryAddress: r.deliveryAddress ?? first.stuffingLocation ?? "",
    terminal: first.portTerminal ?? "",
    containerQuantity: r.containerQuantity ?? stored.length,
    containerSizeType: r.containerSizeType ?? first.sizeType ?? "",
    container: view.containers?.[0]?.containerNumber ?? "",
    detailsSent: Boolean(first.containerDetailsSent),
    customerReady: Boolean(first.containerReady),
    transhipment: r.transhipmentStatus ?? "",
    permitReceived: Boolean(r.permitReceived),
    portnetReleased: Boolean(r.portnetReleased),
    demurrageLastFreeDay: first.demurrageLfd ?? first.combinedLfd ?? null,
    detentionLastFreeDay: first.detentionLfd ?? null,
    atCarparkSince: first.carparkArrivedAt ?? null,
    readyConfirmedAt: first.containerReadyAt ?? null,
    // §35.2: chassis is assigned per container and held for the whole job, so
    // the screens expect one holding per mounted container, not a single id.
    chassis: stored
      .filter((c) => c.chassisId)
      .map((c) => ({
        unit: c.chassisId,
        size: String(c.containerSize ?? c.sizeType ?? "").includes("20") ? "20ft" : "40ft",
        heldSince: (c.chassisMountedAt ?? "").slice(0, 10) || null,
        released: Boolean(c.chassisReleasedAt),
      })),
    exception: null,
    containers: stored.map((c, i) => ({
      ref: c.containerRef ?? `C${i + 1}`,
      number: c.containerNumber ?? "",
      seal: c.sealNumber ?? "",
      tare: c.tareWeightKg ?? null,
      // `state` and `lastFreeDay` are what the container panels read; the
      // state is the engine's derived container status, never recomputed here.
      state: view.containers?.[i]?.status ?? "",
      status: view.containers?.[i]?.status ?? "",
      lastFreeDay: c.demurrageLfd ?? c.combinedLfd ?? null,
    })),
    trips: (view.movements ?? []).map((m) => ({
      id: m.movementRef,
      type: m.movementType,
      status: m.movementStatus,
      origin: m.origin,
      destination: m.destination,
      plannedDate: m.plannedDate,
      autoCreated: m.autoCreated,
    })),
    // The engine's answers. The accessors above read these and never recompute.
    derived: {
      status: view.jobStatus,
      location: view.location,
      nextAction: view.nextActionRequired,
      blocking: view.blockingReason ?? "",
      waitingOn: WAITING_LABEL_API[view.waitingOn] ?? "Nobody",
    },
  };
}

