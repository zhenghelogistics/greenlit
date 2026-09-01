const DEMO_ACTIVITY_AT = "19 Aug 2026, 16:30";
const MAX_CONTAINERS_PER_JOB = 20;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function addActivity(job, text) {
  const activity = job.activity || [];
  return {
    ...job,
    activity: [{ id: `ACT-${String(activity.length + 1).padStart(3, "0")}`, at: DEMO_ACTIVITY_AT, actor: "Operations controller", text }, ...activity],
  };
}

function normaliseNumber(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function ensureContainerRecords(job) {
  if (Array.isArray(job.containers) && job.containers.length) return job.containers;
  if (job.type === "Export") {
    return [{
      ref: "C1",
      ...(job.container || { number: "", seal: "", tareKg: null, vgmKg: null }),
      detailsSent: Boolean(job.detailsSent),
      customerReady: Boolean(job.customerReady),
      stuffingLocation: job.deliveryAddress || "",
    }];
  }
  return [];
}

function tripMatchesContainer(trip, container, index, total) {
  if (trip.containerRef) return trip.containerRef === container.ref;
  if (trip.containerNumber) return trip.containerNumber === container.number;
  return total === 1 || index === 0;
}

function syncExportAggregates(job) {
  if (job.type !== "Export") return job;
  job.container = { ...job.containers[0] };
  job.containerQuantity = job.containers.length;
  job.detailsSent = job.containers.every((container) => Boolean(container.detailsSent));
  job.customerReady = job.containers.every((container) => Boolean(container.customerReady));
  return job;
}

export function nextTripReference(trips = []) {
  const next = trips.reduce((highest, trip) => {
    const number = Number(String(trip.id || "").match(/(\d+)$/)?.[1] || 0);
    return Math.max(highest, number);
  }, 0) + 1;
  return `MOV-${String(next).padStart(3, "0")}`;
}

export function applyJobFacts(job, draft) {
  const next = {
    ...clone(job),
    customer: String(draft.customer || "").trim(),
    booking: String(draft.booking || "").trim(),
    vessel: String(draft.vessel || "").trim(),
    deliveryAddress: String(draft.deliveryAddress || "").trim(),
    ...(job.type === "Import"
      ? { terminal: String(draft.operatingLocation || "").trim() }
      : { emptyYard: String(draft.operatingLocation || "").trim() }),
  };
  next.infoComplete = Boolean(next.customer && next.deliveryAddress && (job.type === "Import" ? next.terminal : next.emptyYard));
  next.missingInformation = next.infoComplete ? [] : [
    ...(!next.customer ? ["Customer"] : []),
    ...(!next.deliveryAddress ? ["Delivery address"] : []),
    ...(!(job.type === "Import" ? next.terminal : next.emptyYard) ? [job.type === "Import" ? "Terminal" : "Empty yard"] : []),
  ];
  return addActivity(next, "Updated the job information and recalculated readiness.");
}

export function applyCheckpoint(job, key, value) {
  const next = clone(job);
  const labels = {
    permitReceived: "Permit",
    portnetReleased: "Portnet release",
    cmsCompleted: "CMS",
    detailsSent: "Container-details notification",
    customerReady: "Customer readiness",
    transhipment: "Transhipment",
    deliveryPath: "Delivery path",
  };

  if (["permitReceived", "portnetReleased", "cmsCompleted", "detailsSent", "customerReady"].includes(key)) {
    next[key] = Boolean(value);
  }

  if (next.type === "Export" && ["detailsSent", "customerReady"].includes(key)) {
    next.containers = ensureContainerRecords(next).map((container) => ({ ...container, [key]: Boolean(value) }));
    syncExportAggregates(next);
  }

  if (key === "permitReceived") {
    next.containers = (next.containers || []).map((container) => ({
      ...container,
      state: value && container.state === "Awaiting permit" ? "Ready" : !value && container.state === "Ready" ? "Awaiting permit" : container.state,
    }));
  }

  if (key === "cmsCompleted" && value && next.type === "Export") {
    next.containers = ensureContainerRecords(next);
    next.trips ||= [];
    next.containers.forEach((container, index) => {
      const hasActiveEmptyCollection = next.trips.some((trip) => trip.type === "Empty Collection" && trip.status !== "Cancelled" && tripMatchesContainer(trip, container, index, next.containers.length));
      if (!hasActiveEmptyCollection) {
        next.trips.push({
          id: nextTripReference(next.trips),
          route: `${next.emptyYard} → ${container.stuffingLocation || next.deliveryAddress}`,
          type: "Empty Collection",
          status: "Pending",
          plannedDate: null,
          containerRef: container.ref,
          containerNumber: container.number || undefined,
          collectedTime: "",
          deliveredTime: "",
          createdAutomatically: true,
        });
      }
    });
  }

  if (key === "transhipment") next.transhipment = value;
  if (key === "deliveryPath") next.carparkRequested = value === "carpark";

  const display = typeof value === "boolean" ? (value ? "complete" : "not complete") : String(value).replaceAll("_", " ");
  return addActivity(next, `${labels[key] || "Checkpoint"} marked ${display}.`);
}

export function applyContainerUpdate(job, index, draft) {
  const next = clone(job);

  if (next.type === "Export") {
    next.containers = ensureContainerRecords(next);
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, next.containers.length - 1));
    const previous = next.containers[safeIndex];
    const number = normaliseNumber(draft.number);
    if (number && next.containers.some((container, containerIndex) => containerIndex !== safeIndex && normaliseNumber(container.number) === number)) {
      throw new Error(`${number} is already on this job.`);
    }
    const container = {
      ...previous,
      ref: previous.ref || `C${safeIndex + 1}`,
      number,
      seal: String(draft.seal || "").trim().toUpperCase(),
      tareKg: draft.tareKg === "" ? null : Number(draft.tareKg),
      vgmKg: draft.vgmKg === "" ? null : Number(draft.vgmKg),
      sizeType: String(draft.sizeType || previous.sizeType || next.containerSizeType || "").trim(),
      stuffingLocation: String(draft.stuffingLocation || previous.stuffingLocation || next.deliveryAddress || "").trim(),
      detailsSent: Boolean(draft.detailsSent),
      customerReady: Boolean(draft.customerReady),
    };
    next.containers[safeIndex] = container;
    if (container.number && container.seal && container.tareKg) {
      next.trips = (next.trips || []).map((trip) => trip.type === "Empty Collection" && trip.status === "Delivered" && tripMatchesContainer(trip, container, safeIndex, next.containers.length)
        ? { ...trip, status: "Completed", containerRef: container.ref, containerNumber: container.number }
        : trip);
      const missingDeliveredDetails = next.containers.some((item, containerIndex) => {
        const deliveredEmpty = (next.trips || []).some((trip) => trip.type === "Empty Collection" && ["Delivered", "Completed"].includes(trip.status) && tripMatchesContainer(trip, item, containerIndex, next.containers.length));
        return deliveredEmpty && !(item.number && item.seal && item.tareKg);
      });
      if (!missingDeliveredDetails && next.exception?.open) next.exception = { ...next.exception, open: false };
    }
    syncExportAggregates(next);
    return addActivity(next, `Updated ${container.ref}${container.number ? ` · ${container.number}` : " container details"}.`);
  }

  const safeIndex = Math.max(0, Math.min(Number(index) || 0, next.containers.length - 1));
  const previous = next.containers[safeIndex];
  const container = {
    ...previous,
    number: normaliseNumber(draft.number),
    type: String(draft.type || previous.type || "").trim(),
    seal: String(draft.seal || previous.seal || "").trim().toUpperCase(),
    state: draft.state,
    lastFreeDay: draft.lastFreeDay,
  };
  next.containers[safeIndex] = container;
  next.permitReceived = !next.containers.some((item) => item.state === "Awaiting permit");

  if (["Collected", "Delivered"].includes(container.state)) {
    const tripIndex = next.trips.findIndex((trip) => trip.type === "Import Delivery" && !["Completed", "Cancelled"].includes(trip.status) && (!trip.containerNumber || trip.containerNumber === container.number));
    if (tripIndex >= 0) {
      const status = container.state === "Delivered" ? "Completed" : "Collected";
      next.trips[tripIndex] = {
        ...next.trips[tripIndex],
        containerNumber: container.number,
        status,
        collectedTime: next.trips[tripIndex].collectedTime || DEMO_ACTIVITY_AT,
        deliveredTime: status === "Completed" ? (next.trips[tripIndex].deliveredTime || DEMO_ACTIVITY_AT) : next.trips[tripIndex].deliveredTime,
      };
    }
  }

  const allDelivered = next.containers.every((item) => item.state === "Delivered");
  if (allDelivered && !next.trips.some((trip) => trip.type === "Empty Return" && trip.status !== "Cancelled")) {
    next.trips.push({
      id: nextTripReference(next.trips),
      route: `${next.deliveryAddress} → ${next.emptyYard || "Empty depot to confirm"}`,
      type: "Empty Return",
      status: "Pending",
      plannedDate: null,
      collectedTime: "",
      deliveredTime: "",
      createdAutomatically: true,
    });
  }

  return addActivity(next, `Updated ${container.number} from ${previous.state} to ${container.state}.`);
}

export function addContainerRecord(job, draft = {}) {
  const next = clone(job);
  next.containers = ensureContainerRecords(next);
  if (next.containers.length >= MAX_CONTAINERS_PER_JOB) {
    throw new Error(`A job can contain up to ${MAX_CONTAINERS_PER_JOB} containers.`);
  }

  const number = normaliseNumber(draft.number);
  if (number && next.containers.some((container) => normaliseNumber(container.number) === number)) {
    throw new Error(`${number} is already on this job.`);
  }
  if (next.type === "Import" && !number) throw new Error("Enter the import container number.");

  const nextRef = next.containers.reduce((highest, container) => Math.max(highest, Number(String(container.ref || "").replace(/\D/g, "")) || 0), next.containers.length) + 1;
  const container = next.type === "Export" ? {
    ref: `C${nextRef}`,
    number,
    seal: String(draft.seal || "").trim().toUpperCase(),
    tareKg: draft.tareKg === "" || draft.tareKg == null ? null : Number(draft.tareKg),
    vgmKg: draft.vgmKg === "" || draft.vgmKg == null ? null : Number(draft.vgmKg),
    sizeType: String(draft.sizeType || next.containerSizeType || "").trim(),
    stuffingLocation: String(draft.stuffingLocation || next.deliveryAddress || "").trim(),
    detailsSent: Boolean(draft.detailsSent),
    customerReady: Boolean(draft.customerReady),
  } : {
    ref: `C${nextRef}`,
    number,
    type: String(draft.type || "").trim(),
    seal: String(draft.seal || "").trim().toUpperCase(),
    state: draft.state || (next.permitReceived ? "Ready" : "Awaiting permit"),
    lastFreeDay: draft.lastFreeDay || next.demurrageLastFreeDay || "",
  };

  next.containers.push(container);
  if (next.type === "Export") {
    if (next.cmsCompleted) {
      next.trips ||= [];
      next.trips.push({
        id: nextTripReference(next.trips),
        route: `${next.emptyYard} → ${container.stuffingLocation || next.deliveryAddress}`,
        type: "Empty Collection",
        status: "Pending",
        plannedDate: null,
        containerRef: container.ref,
        containerNumber: container.number || undefined,
        collectedTime: "",
        deliveredTime: "",
        createdAutomatically: true,
      });
    }
    syncExportAggregates(next);
  }
  return addActivity(next, `Added ${container.ref}${container.number ? ` · ${container.number}` : ""}. This job now has ${next.containers.length} containers.`);
}

export function removeContainerRecord(job, index) {
  const next = clone(job);
  next.containers = ensureContainerRecords(next);
  if (next.containers.length <= 1) throw new Error("A job must retain at least one container record.");
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, next.containers.length - 1));
  const container = next.containers[safeIndex];
  const containerRef = container.ref || `C${safeIndex + 1}`;
  const hasLinkedMovement = (next.trips || []).some((trip) => trip.status !== "Cancelled" && tripMatchesContainer(trip, container, safeIndex, next.containers.length));
  if (hasLinkedMovement) throw new Error(`${containerRef} has a linked movement and cannot be removed.`);
  next.containers.splice(safeIndex, 1);
  if (next.type === "Export") syncExportAggregates(next);
  return addActivity(next, `Removed ${containerRef}${container.number ? ` · ${container.number}` : ""}. ${next.containers.length} containers remain.`);
}

export function applyTripUpdate(job, tripId, draft) {
  const next = clone(job);
  const existingIndex = next.trips.findIndex((trip) => trip.id === tripId);
  let trip = {
    ...(existingIndex >= 0 ? next.trips[existingIndex] : {}),
    id: existingIndex >= 0 ? tripId : nextTripReference(next.trips),
    route: String(draft.route || "").trim(),
    type: draft.type,
    status: draft.status,
    plannedDate: draft.plannedDate || null,
    containerRef: draft.containerRef || undefined,
    containerNumber: draft.containerNumber || undefined,
    collectedTime: ["Collected", "In Transit", "Delivered", "Completed"].includes(draft.status)
      ? (existingIndex >= 0 ? next.trips[existingIndex].collectedTime : "") || DEMO_ACTIVITY_AT
      : "",
    deliveredTime: ["Delivered", "Completed"].includes(draft.status)
      ? (existingIndex >= 0 ? next.trips[existingIndex].deliveredTime : "") || DEMO_ACTIVITY_AT
      : "",
    cancelledReason: draft.status === "Cancelled" ? String(draft.cancelledReason || "Cancelled by operations").trim() : undefined,
  };

  if (next.type === "Export") {
    next.containers = ensureContainerRecords(next);
    const targetIndex = next.containers.findIndex((container) => (trip.containerRef && container.ref === trip.containerRef) || (trip.containerNumber && container.number === trip.containerNumber));
    const fallbackIndex = next.containers.findIndex((container, containerIndex) => !(next.trips || []).some((item) => item.id !== tripId && item.type === trip.type && item.status !== "Cancelled" && tripMatchesContainer(item, container, containerIndex, next.containers.length)));
    const containerIndex = targetIndex >= 0 ? targetIndex : fallbackIndex;
    const container = next.containers[containerIndex];
    if (container) {
      trip = { ...trip, containerRef: container.ref, containerNumber: container.number || undefined };
      if (trip.type === "Empty Collection" && ["Delivered", "Completed"].includes(trip.status) && !(container.number && container.seal && container.tareKg)) {
        trip.status = "Delivered";
        trip.deliveredTime ||= DEMO_ACTIVITY_AT;
        next.exception = next.exception?.open ? next.exception : { open: true, text: `${container.ref} empty delivered without container details`, openedAt: DEMO_ACTIVITY_AT };
      }
    }
  }

  if (existingIndex >= 0) next.trips[existingIndex] = trip;
  else next.trips.push(trip);

  if (next.type === "Import" && trip.type === "Import Delivery") {
    const containerIndex = next.containers.findIndex((container) => container.number === trip.containerNumber);
    const fallbackIndex = next.containers.findIndex((container) => container.state !== "Delivered");
    const targetIndex = containerIndex >= 0 ? containerIndex : fallbackIndex;
    if (targetIndex >= 0 && ["Collected", "In Transit", "Delivered", "Completed"].includes(trip.status)) {
      next.containers[targetIndex] = {
        ...next.containers[targetIndex],
        state: ["Delivered", "Completed"].includes(trip.status) ? "Delivered" : "Collected",
      };
    }
  }

  if (["Empty Return", "Direct Laden to Port", "Carpark to Port"].includes(trip.type) && trip.status === "Completed") {
    next.chassis = (next.chassis || []).map((item) => ({ ...item, released: true }));
  }

  return addActivity(next, `${trip.id} ${existingIndex >= 0 ? "updated" : "created"}: ${trip.type} is ${trip.status.toLowerCase()}.`);
}

export function assignChassis(job, unit, size) {
  const next = clone(job);
  if (!(next.chassis || []).some((item) => item.unit === Number(unit) && !item.released)) {
    next.chassis = [...(next.chassis || []), { unit: Number(unit), size, heldSince: "2026-08-19" }];
  }
  return addActivity(next, `Assigned chassis ${unit} (${size}) to this job.`);
}

export function releaseChassis(job, unit) {
  const next = clone(job);
  next.chassis = (next.chassis || []).map((item) => item.unit === Number(unit) ? { ...item, released: true } : item);
  return addActivity(next, `Released chassis ${unit} back to the available fleet.`);
}

export function applyFreeTime(job, draft) {
  const next = {
    ...clone(job),
    demurrageLastFreeDay: draft.demurrageLastFreeDay,
    detentionLastFreeDay: draft.detentionLastFreeDay,
    deadlineProvisional: false,
  };
  next.containers = (next.containers || []).map((container) => ({ ...container, lastFreeDay: draft.demurrageLastFreeDay }));
  return addActivity(next, "Confirmed the demurrage and detention free-time dates.");
}
