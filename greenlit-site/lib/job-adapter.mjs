// Extracted from the control tower component so it can be unit-tested.
// Pure data mapping: API shape in, screen shape out. No JSX, no React.

export const WAITING_LABEL_API = { US: "Us", CUSTOMER: "Customer", CARRIER: "Carrier", NOBODY: "Nobody" };

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
/**
 * One clock's last free day, as the engine counted it.
 *
 * Reading the clocks rather than the stored columns is the difference between
 * "the date that applies" and "a date somebody once typed": the engine counts
 * from the vessel ETA and lets a controller's override win, and neither of
 * those is visible in the raw figures.
 */
const lfdOf = (container, label) =>
  container?.freeTime?.find((clock) => clock.label === label)?.lastFreeDay ?? null;

export function jobFromApi(view) {
  const r = view.record ?? {};
  const stored = view.storedContainers ?? [];
  const first = stored[0] ?? {};
  const isImport = view.domain === "IMPORT";

  return {
    id: view.jobNumber,
    // The API is addressed by internal id; screens display the job number.
    // Keeping both means a command can be issued from a row that only shows
    // the human reference.
    apiId: view.jobId,
    type: isImport ? "Import" : "Export",
    customer: view.customer,
    createdDate: (r.createdAt ?? "").slice(0, 10),
    booking: r.bookingReference ?? r.blNumber ?? "",
    // The detail screen renders these directly. They were never produced here,
    // so "Bill of lading" read "Not recorded" on every job that had one.
    billOfLading: r.blNumber ?? "",
    houseBillOfLading: r.houseBlNumber ?? "",
    vessel: [r.vesselName, r.voyageNumber].filter(Boolean).join(" / "),
    // §34.1 and the dashboard's arrival timeline both count from this, and it
    // is the one date a controller sorts the morning by. Import calls it `eta`
    // and export `etaSingapore`; the screen wants one field.
    eta: r.eta ?? r.etaSingapore ?? null,
    infoComplete: view.mandatoryComplete,
    missingInformation: view.missingInformation ?? [],
    // What stops the controller starting, which is a much shorter list than
    // everything still to gather.
    handoverShipmentGaps: view.handoverShipmentGaps ?? [],
    cmsCompleted: r.cmsStatus === "COMPLETED" || r.cmsStatus === "NOT_REQUIRED",
    emptyYard: r.emptyCollectionYard ?? "",
    deliveryAddress: r.deliveryAddress ?? first.stuffingLocation ?? "",
    terminal: first.portTerminal ?? "",
    containerQuantity: r.containerQuantity ?? stored.length,
    containerSizeType: r.containerSizeType ?? first.sizeType ?? "",
    container: view.containers?.[0]?.containerNumber ?? "",
    detailsSent: Boolean(first.containerDetailsSent),
    // §42. Who was told and where the message is. The question asked when
    // stuffing has not started is never "was it sent" but "who told whom".
    detailsSentTo: first.containerDetailsSentTo ?? "",
    detailsSentBy: first.containerDetailsSentBy ?? "",
    detailsSentAt: first.containerDetailsSentAt ?? null,
    detailsReference: first.containerDetailsReference ?? "",
    customerReady: Boolean(first.containerReady),
    transhipment: r.transhipmentStatus ?? "",
    // §21. Read by the export status derivation and never produced here, so
    // `job.carparkRequested == null` was always true: "Carpark Decision
    // Needed" could not clear, and "Ready for One-Way Loaded Trip" could not
    // be reached. It is a plain boolean in the record — there is no undecided
    // state — so the screen tests it as one.
    carparkRequested: Boolean(r.carparkRequested),
    // §24. Both halves, because "needs a permit and has not got one" cannot be
    // asked with only the second: a job that never needed one would read as
    // outstanding forever.
    permitRequired: Boolean(r.permitRequired),
    permitReceived: Boolean(r.permitReceived),
    portnetReleased: Boolean(r.portnetReleased),
    // §34.1, §54. The job-level pair the operations screens read, taken from
    // the engine's clocks for the first container rather than from whichever
    // stored figure happened to be set. A combined allowance has no separate
    // detention date, and this now says so instead of reaching for a split
    // value the carrier's terms do not give.
    demurrageLastFreeDay: lfdOf(view.containers?.[0], "Demurrage")
      ?? lfdOf(view.containers?.[0], "Combined D&D"),
    detentionLastFreeDay: lfdOf(view.containers?.[0], "Detention"),
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
    // §13 activity timeline, rendered from the audit stream. A system entry
    // always carries the rule that produced it, so the narrative explains
    // itself without opening anything else.
    // §31/§32. The trip the box makes, derived server-side.
    journey: view.journey ?? [],
    activity: (view.activity ?? []).map((e, i) => ({
      id: `${e.at}-${i}`,
      text: e.description,
      at: e.at,
      actor: e.actor,
    })),
    // Present only for jobs created through document intake.
    sourceDocument: null,
    // §27.1 exceptions are records; none are surfaced through the API yet.
    exception: null,
    // §12 conflicts awaiting a decision, from the server. They are records,
    // not screen state, so they survive a reload and a different browser.
    discrepancies: view.discrepancies ?? [],
    // The last extracted field set, kept so a later document can be reconciled
    // against what a previous one established.
    documentFields: {},
    containers: stored.map((c, i) => ({
      // Commands address a container by its internal id; screens show the ref.
      id: view.containers?.[i]?.containerId ?? c.exportContainerId ?? c.containerId ?? null,
      ref: c.containerRef ?? `C${i + 1}`,
      number: c.containerNumber ?? "",
      seal: c.sealNumber ?? "",
      tare: c.tareWeightKg ?? null,
      // Stored split, shown joined: the database keeps size and type apart so
      // either can be queried, and a person reads "40' HIGH CUBE".
      sizeType: [c.containerSize, c.containerType].filter(Boolean).join(" ")
        || c.sizeType || "",
      grossWeight: c.grossWeight ?? null,
      packageCount: c.packageCount ?? null,
      packageType: c.packageType ?? "",
      // §34. Which clocks this container actually has is the model's to say.
      freeTimeModel: c.freeTimeModel ?? "NOT_CONFIRMED",
      freeTimeRemarks: c.freeTimeRemarks ?? "",
      // §34.2. Stored, so the drawer can show what is already on file rather
      // than presenting an empty box over a rate somebody already entered.
      dailyRate: c.dailyRate ?? null,
      currency: c.currency ?? "",
      // `state` and `lastFreeDay` are what the container panels read; the
      // state is the engine's derived container status, never recomputed here.
      state: view.containers?.[i]?.status ?? "",
      status: view.containers?.[i]?.status ?? "",
      // §34.1, §54. Read, never derived here. Picking between the stored
      // figures on the client is how a stale split date came to be shown over
      // the combined one that applied; the engine counts it from the ETA now
      // and this is the only place the answer comes from.
      lastFreeDay: view.containers?.[i]?.carrierLastFreeDay ?? null,
      // §34.4, computed server-side. A countdown a screen works out itself is
      // a countdown that can disagree with the next screen's.
      freeTime: view.containers?.[i]?.freeTime ?? [],
      // §34.0. The third number, derived server-side with the other two.
      charge: view.containers?.[i]?.charge ?? null,
      // Whether this box is on the controller's board, and what stops it.
      handedOverAt: view.containers?.[i]?.handedOverAt ?? null,
      handedOverBy: view.containers?.[i]?.handedOverBy ?? "",
      handoverGaps: view.containers?.[i]?.handoverGaps ?? [],
      // The controller's four piles, and the two facts behind them.
      controllerStage: view.containers?.[i]?.controllerStage ?? "PENDING",
      pendingReasons: view.containers?.[i]?.pendingReasons ?? [],
      dischargedAt: view.containers?.[i]?.dischargedAt ?? null,
      deliveredAt: view.containers?.[i]?.deliveredAt ?? null,
      canPlanCollection: Boolean(view.containers?.[i]?.canPlanCollection),
    })),
    trips: (view.movements ?? []).map((m) => ({
      id: m.movementRef,
      type: m.movementType,
      status: m.movementStatus,
      origin: m.origin,
      destination: m.destination,
      plannedDate: m.plannedDate,
      plannedTime: m.plannedTime,
      // §21.3 and the movements panel. Who is actually doing this trip — the
      // demo's movement row names all three, and without them it reads as a
      // route with nobody on it.
      truck: m.truck,
      driver: m.driver,
      chassisId: m.chassisId,
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

