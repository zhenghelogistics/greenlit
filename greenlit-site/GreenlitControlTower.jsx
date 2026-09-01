/*
THESIS: A calm maritime operations console turns readiness facts into visible work without visual noise.
OWN-WORLD: Ink-navy structure, precise typography, quiet neutral surfaces, and status color used only when it carries meaning.
STORY: Controllers turn an arrival notice into reviewed job facts, open any operational fact as work, clear the blocker, and see the job, trip, container, chassis, queue, and activity history respond together.
FIRST VIEWPORT: A compact ink command bar, eight quiet operating indicators, then the urgency-ranked action register with responsibility shown in words.
FORM: Maritime operations console — restrained, data-led, and shift-ready. Signature interaction: every operable fact opens the same management drawer, and saving carries visible consequences across the shared job record.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
*/

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Anchor,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Container as ContainerIcon,
  FileCheck2,
  FileSearch,
  FileText,
  History,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  MapPin,
  PackageCheck,
  PencilLine,
  Plus,
  RotateCcw,
  Save,
  ScanText,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
  Warehouse,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { addIsoDays, MAX_CONTAINERS_PER_JOB, parseArrivalNoticeText, REQUIRED_JOB_FIELDS } from "./lib/arrival-notice-parser.mjs";
import { addContainerRecord, applyCheckpoint, applyContainerUpdate, applyFreeTime, applyJobFacts, applyTripUpdate, assignChassis, nextTripReference, releaseChassis, removeContainerRecord } from "./lib/operations-actions.mjs";
import { readPdfText } from "./lib/read-pdf.mjs";

// -----------------------------------------------------------------------------
// Seed data — fixed at 19 August 2026 so the demo is repeatable.
// -----------------------------------------------------------------------------

const DEMO_TODAY = "2026-08-19";
const CARPARK = "ZHL Carpark, Pioneer Road";
const CHASSIS_TOTALS = { "20ft": 47, "40ft": 42 };
const MAINTENANCE_UNITS = {
  "20ft": [2040, 2043, 2055, 2066, 2072, 2080],
  "40ft": [4031, 4036, 4045, 4058, 4065, 4488],
};

const DOCUMENT_FIELD_GROUPS = [
  {
    title: "Shipment",
    fields: [
      { key: "issueDate", label: "Issue date", type: "date" },
      { key: "eta", label: "Estimated arrival", type: "date", required: true },
      { key: "billOfLading", label: "Bill of lading", required: true },
      { key: "bookingNumber", label: "Booking number" },
      { key: "vessel", label: "Main vessel", required: true },
      { key: "voyage", label: "Voyage" },
      { key: "portOfLoading", label: "Port of loading" },
      { key: "portOfDischarge", label: "Port of discharge", required: true },
      { key: "terminal", label: "Discharging terminal", required: true },
      { key: "haulage", label: "Haulage" },
    ],
  },
  {
    title: "Cargo",
    fields: [
      { key: "packageCount", label: "Packages", inputMode: "numeric" },
      { key: "packageType", label: "Package type" },
      { key: "grossWeightKg", label: "Gross weight (kg)", inputMode: "decimal" },
      { key: "volumeM3", label: "Volume (m³)", inputMode: "decimal" },
      { key: "cargoDescription", label: "Cargo description", multiline: true },
    ],
  },
  {
    title: "Parties and delivery",
    fields: [
      { key: "shipper", label: "Shipper", multiline: true },
      { key: "consignee", label: "Consignee", multiline: true, required: true },
      { key: "notify", label: "Notify party", multiline: true },
      { key: "deliveryAddress", label: "Delivery address", multiline: true },
      { key: "reference", label: "Carrier reference" },
    ],
  },
  {
    title: "Free-time terms",
    fields: [
      { key: "demurrageFreeDays", label: "Demurrage-free days", inputMode: "numeric" },
      { key: "detentionFreeDays", label: "Detention-free days", inputMode: "numeric" },
    ],
  },
];

export const SEED_JOBS = [
  {
    id: "EXP-260819-001",
    type: "Export",
    customer: "Sunrise Foods Pte Ltd",
    createdDate: "2026-08-19",
    booking: "BK-88213",
    vessel: "Ever Lambent 044E",
    infoComplete: true,
    cmsCompleted: false,
    emptyYard: "Cogent Jurong Depot",
    deliveryAddress: "Sunrise Foods, Tuas South",
    containerQuantity: 2,
    containerSizeType: "40 HQ",
    container: { number: "", seal: "", tareKg: null, vgmKg: null },
    detailsSent: false,
    customerReady: false,
    transhipment: null,
    trips: [],
    exception: null,
  },
  {
    id: "EXP-260819-002",
    type: "Export",
    customer: "Meridian Trading",
    createdDate: "2026-08-18",
    booking: "BK-77104",
    vessel: "CMA CGM Tigris 198W",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "YCH Tuas Depot",
    deliveryAddress: "Meridian Trading, Penjuru",
    container: { number: "", seal: "", tareKg: null, vgmKg: null },
    detailsSent: false,
    customerReady: false,
    transhipment: null,
    chassis: [{ unit: 4033, size: "40ft", heldSince: "2026-08-17" }],
    trips: [
      {
        id: "MOV-001",
        route: "YCH Tuas Depot → Meridian Trading",
        type: "Empty Collection",
        status: "Delivered",
        plannedDate: "2026-08-18",
        collectedTime: "18 Aug 2026, 09:10",
        deliveredTime: "18 Aug 2026, 14:20",
      },
    ],
    exception: {
      open: true,
      text: "Empty delivered without container details",
      openedAt: "18 Aug 2026, 15:20",
    },
  },
  {
    id: "EXP-260818-003",
    type: "Export",
    customer: "Anchor Chemicals",
    createdDate: "2026-08-15",
    booking: "BK-66489",
    vessel: "ONE Integrity 062E",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "Sembawang Container Yard",
    deliveryAddress: "Anchor Chemicals, Jurong Island",
    container: { number: "TGHU7719045", seal: "551902", tareKg: 3780, vgmKg: null },
    detailsSent: true,
    customerReady: true,
    readyConfirmedAt: "2026-08-15",
    transhipment: "pending",
    chassis: [{ unit: 4041, size: "40ft", heldSince: "2026-08-15" }],
    trips: [
      {
        id: "MOV-001",
        route: "Sembawang Container Yard → Anchor Chemicals",
        type: "Empty Collection",
        status: "Completed",
        plannedDate: "2026-08-15",
        collectedTime: "15 Aug 2026, 08:25",
        deliveredTime: "15 Aug 2026, 12:40",
      },
    ],
    exception: null,
  },
  {
    id: "EXP-260815-004",
    type: "Export",
    customer: "Pacific Rim Textiles",
    createdDate: "2026-08-10",
    booking: "BK-55312",
    vessel: "Maersk Lima 231W",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "Cogent Jurong Depot",
    deliveryAddress: "Pacific Rim Textiles, Kallang",
    container: { number: "ABCU9963012", seal: "772410", tareKg: 4010, vgmKg: 23780 },
    detailsSent: true,
    customerReady: true,
    transhipment: "pending",
    atCarparkSince: "2026-08-13",
    chassis: [{ unit: 4052, size: "40ft", heldSince: "2026-08-10" }],
    trips: [
      {
        id: "MOV-001",
        route: "Cogent Jurong Depot → Pacific Rim Textiles",
        type: "Empty Collection",
        status: "Completed",
        plannedDate: "2026-08-10",
        collectedTime: "10 Aug 2026, 07:40",
        deliveredTime: "10 Aug 2026, 11:35",
      },
      {
        id: "MOV-002",
        route: `Pacific Rim Textiles → ${CARPARK}`,
        type: "One-Way Loaded",
        status: "Completed",
        plannedDate: "2026-08-13",
        collectedTime: "13 Aug 2026, 16:10",
        deliveredTime: "13 Aug 2026, 18:05",
      },
    ],
    exception: null,
  },
  {
    id: "EXP-260819-005",
    type: "Export",
    customer: "Golden Harvest Foods",
    createdDate: "2026-08-17",
    booking: "BK-90551",
    vessel: "Ever Basis 110E",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "YCH Tuas Depot",
    deliveryAddress: "Golden Harvest Foods, Woodlands",
    container: { number: "TGHU2288471", seal: "994021", tareKg: 3920, vgmKg: 24480 },
    detailsSent: true,
    customerReady: true,
    transhipment: "pending",
    chassis: [{ unit: 4029, size: "40ft", heldSince: "2026-08-17" }],
    trips: [
      {
        id: "MOV-001",
        route: "YCH Tuas Depot → Golden Harvest Foods",
        type: "Empty Collection",
        status: "Completed",
        plannedDate: "2026-08-17",
        collectedTime: "17 Aug 2026, 08:00",
        deliveredTime: "17 Aug 2026, 12:15",
      },
    ],
    exception: null,
  },
  {
    id: "EXP-260817-006",
    type: "Export",
    customer: "Sunrise Foods Pte Ltd",
    createdDate: "2026-08-14",
    booking: "BK-61304",
    vessel: "OOCL Belgium 090W",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "Cogent Jurong Depot",
    deliveryAddress: "Sunrise Foods, Tuas South",
    container: { number: "OOLU3309128", seal: "410625", tareKg: 3670, vgmKg: 22110 },
    detailsSent: true,
    customerReady: true,
    transhipment: "available",
    chassis: [{ unit: 4060, size: "40ft", heldSince: "2026-08-14", released: true }],
    trips: [
      {
        id: "MOV-001",
        route: "Cogent Jurong Depot → Sunrise Foods",
        type: "Empty Collection",
        status: "Completed",
        plannedDate: "2026-08-14",
        collectedTime: "14 Aug 2026, 07:55",
        deliveredTime: "14 Aug 2026, 11:20",
      },
      {
        id: "MOV-002",
        route: "Sunrise Foods → PSA Tuas",
        type: "Direct Laden to Port",
        status: "Delivered",
        plannedDate: "2026-08-17",
        collectedTime: "17 Aug 2026, 13:10",
        deliveredTime: "17 Aug 2026, 17:25",
      },
    ],
    exception: null,
  },
  {
    id: "EXP-260819-007",
    type: "Export",
    customer: "Keppel Marine Supplies",
    createdDate: "2026-08-19",
    booking: "BK-11820",
    vessel: "Wan Hai 503 076E",
    infoComplete: false,
    missingInformation: ["Empty delivery address", "Export clearance reference"],
    cmsCompleted: false,
    emptyYard: "Sembawang Container Yard",
    deliveryAddress: "",
    container: { number: "", seal: "", tareKg: null, vgmKg: null },
    detailsSent: false,
    customerReady: false,
    transhipment: null,
    trips: [],
    exception: null,
  },
  {
    id: "JOB-260819-001",
    type: "Import",
    customer: "Wellmark Industrial",
    createdDate: "2026-08-19",
    infoComplete: true,
    permitReceived: false,
    portnetReleased: true,
    terminal: "PSA Pasir Panjang",
    deliveryAddress: "Wellmark Industrial, Tuas",
    containers: [{ number: "MSKU3320981", state: "At terminal", lastFreeDay: "2026-08-22" }],
    trips: [],
    demurrageLastFreeDay: "2026-08-22",
    detentionLastFreeDay: "2026-08-27",
    exception: null,
  },
  {
    id: "JOB-260818-002",
    type: "Import",
    customer: "Kimtex Manufacturing",
    createdDate: "2026-08-18",
    infoComplete: true,
    permitReceived: true,
    portnetReleased: true,
    terminal: "PSA Brani",
    deliveryAddress: "Kimtex Manufacturing, Senoko",
    containers: [{ number: "OOLU8841250", state: "Ready", lastFreeDay: "2026-08-19" }],
    chassis: [{ unit: 2044, size: "20ft", heldSince: "2026-08-18" }],
    trips: [],
    demurrageLastFreeDay: "2026-08-19",
    detentionLastFreeDay: "2026-08-24",
    exception: null,
  },
  {
    id: "JOB-260817-003",
    type: "Import",
    customer: "Orient Steel Trading",
    createdDate: "2026-08-17",
    infoComplete: true,
    permitReceived: false,
    portnetReleased: true,
    terminal: "PSA Tuas",
    deliveryAddress: "Orient Steel Trading, Pioneer",
    containers: [
      { number: "TCNU5590183", state: "Delivered", lastFreeDay: "2026-08-21" },
      { number: "TCNU5590191", state: "Ready", lastFreeDay: "2026-08-21" },
      { number: "TCNU6620447", state: "Awaiting permit", lastFreeDay: "2026-08-21" },
    ],
    chassis: [
      { unit: 2051, size: "20ft", heldSince: "2026-08-17" },
      { unit: 2052, size: "20ft", heldSince: "2026-08-17" },
      { unit: 4038, size: "40ft", heldSince: "2026-08-17" },
    ],
    trips: [
      {
        id: "MOV-001",
        route: "PSA Tuas → Orient Steel Trading",
        type: "Import Delivery",
        status: "Completed",
        plannedDate: "2026-08-17",
        collectedTime: "17 Aug 2026, 08:40",
        deliveredTime: "17 Aug 2026, 12:55",
      },
      {
        id: "MOV-002",
        route: "PSA Tuas → Orient Steel Trading",
        type: "Import Delivery",
        status: "Pending",
        plannedDate: "2026-08-19",
        collectedTime: "",
        deliveredTime: "",
      },
    ],
    demurrageLastFreeDay: "2026-08-21",
    detentionLastFreeDay: "2026-08-26",
    exception: null,
  },
  {
    id: "JOB-260816-004",
    type: "Import",
    customer: "Wellmark Industrial",
    createdDate: "2026-08-16",
    infoComplete: true,
    permitReceived: true,
    portnetReleased: true,
    terminal: "PSA Keppel",
    emptyYard: "YCH Tuas Depot",
    deliveryAddress: "Wellmark Industrial, Tuas",
    containers: [{ number: "CSNU7213366", state: "Delivered", lastFreeDay: "2026-08-17" }],
    chassis: [{ unit: 2038, size: "20ft", heldSince: "2026-08-16" }],
    trips: [
      {
        id: "MOV-001",
        route: "PSA Keppel → Wellmark Industrial",
        type: "Import Delivery",
        status: "Completed",
        plannedDate: "2026-08-16",
        collectedTime: "16 Aug 2026, 09:05",
        deliveredTime: "16 Aug 2026, 13:30",
      },
      {
        id: "MOV-002",
        route: "Wellmark Industrial → YCH Tuas Depot",
        type: "Empty Return",
        status: "Pending",
        plannedDate: null,
        collectedTime: "",
        deliveredTime: "",
      },
    ],
    demurrageLastFreeDay: "2026-08-17",
    detentionLastFreeDay: "2026-08-21",
    exception: null,
  },
  {
    id: "JOB-260819-005",
    type: "Import",
    customer: "Nexus Polymers",
    createdDate: "2026-08-19",
    infoComplete: false,
    missingInformation: ["Delivery address", "Gross weight"],
    permitReceived: false,
    portnetReleased: false,
    terminal: "PSA Pasir Panjang",
    deliveryAddress: "",
    containers: [{ number: "SEGU4402819", state: "At terminal", lastFreeDay: "2026-08-24" }],
    trips: [],
    demurrageLastFreeDay: "2026-08-24",
    detentionLastFreeDay: "2026-08-29",
    exception: null,
  },
];

// -----------------------------------------------------------------------------
// Derived operational logic — no displayed state is stored separately.
// -----------------------------------------------------------------------------

function jobContainers(job) {
  if (Array.isArray(job.containers) && job.containers.length) return job.containers;
  if (job.type === "Export") return [{
    ref: "C1",
    ...(job.container || { number: "", seal: "", tareKg: null, vgmKg: null }),
    detailsSent: Boolean(job.detailsSent),
    customerReady: Boolean(job.customerReady),
    stuffingLocation: job.deliveryAddress || "",
  }];
  return [];
}

function movementMatchesContainer(trip, container, index, total) {
  if (trip.containerRef) return trip.containerRef === container.ref;
  if (trip.containerNumber) return trip.containerNumber === container.number;
  return total === 1 || index === 0;
}

function parseDay(value) {
  return new Date(`${value}T12:00:00+08:00`);
}

function dayDifference(from, to) {
  return Math.round((parseDay(to) - parseDay(from)) / 86400000);
}

function daysUntil(value) {
  return dayDifference(DEMO_TODAY, value);
}

function daysHeld(value) {
  return dayDifference(value, DEMO_TODAY);
}

function activeTrips(job) {
  return job.trips.filter((trip) => trip.status !== "Cancelled");
}

function tripOfType(job, names) {
  return activeTrips(job).find((trip) => names.includes(trip.type));
}

function exportContainerStatus(job, container, index) {
  const containers = jobContainers(job);
  const trips = activeTrips(job).filter((trip) => movementMatchesContainer(trip, container, index, containers.length));
  const finalPort = trips.find((trip) => ["Direct Laden to Port", "Carpark to Port"].includes(trip.type));
  const oneWay = trips.find((trip) => trip.type === "One-Way Loaded");
  const ladenTrip = trips.find((trip) => ["Direct Laden to Port", "One-Way Loaded", "Carpark to Port"].includes(trip.type));
  const emptyTrip = trips.find((trip) => trip.type === "Empty Collection");

  if (finalPort?.status === "Completed") return "Completed";
  if (finalPort?.status === "Delivered") return "Delivered to Port";
  if (job.atCarparkSince && job.transhipment === "available") return "Ready for Port Delivery";
  if (oneWay?.status === "Completed" && job.transhipment === "pending") return "Awaiting T/T";
  if (oneWay?.status === "Completed") return "At Carpark";
  if (ladenTrip && ["Collected", "In Transit"].includes(ladenTrip.status)) return "Laden Collected";
  if (container.vgmKg && job.transhipment === "pending") return "Awaiting T/T";
  if (container.customerReady && !container.vgmKg) return "Awaiting VGM";
  if (job.carparkRequested && oneWay?.status === "Pending") return "Ready for One-Way Loaded Trip";
  if (finalPort?.type === "Direct Laden to Port" && finalPort.status === "Pending") return "Ready for Direct Laden Trip";
  if (job.transhipment === "not_available" && job.carparkRequested == null) return "Carpark Decision Needed";
  if (job.transhipment === "not_available" && job.carparkRequested === false) return "Delivery Path Needed";
  if (container.detailsSent && !container.customerReady) return "Awaiting Customer Stuffing";
  if (container.number && !container.detailsSent) return "Awaiting Container Details Notification";
  if (["Delivered", "Completed"].includes(emptyTrip?.status) && !container.number) return "Empty Delivered";
  if (["Collected", "In Transit"].includes(emptyTrip?.status)) return "Empty Collected";
  if (emptyTrip?.plannedDate) return "Empty Collection Scheduled";
  if (job.infoComplete && job.cmsCompleted) return "Ready for Empty Collection";
  if (job.infoComplete && !job.cmsCompleted) return "Awaiting CMS";
  return "Incomplete";
}

function exportStatus(job) {
  const statuses = jobContainers(job).map((container, index) => exportContainerStatus(job, container, index));
  if (statuses.every((status) => status === "Completed")) return "Completed";
  if (statuses.some((status) => ["Completed", "Delivered to Port"].includes(status))) return "Partially Delivered";
  const progressed = statuses.filter((status) => !["Incomplete", "Awaiting CMS", "Ready for Empty Collection", "Empty Collection Scheduled"].includes(status)).length;
  if (progressed > 0 && progressed < statuses.length) return "Partially Collected";
  const precedence = ["Incomplete", "Awaiting CMS", "Empty Delivered", "Awaiting Container Details Notification", "Awaiting Customer Stuffing", "Awaiting VGM", "Carpark Decision Needed", "Delivery Path Needed", "Awaiting T/T", "Ready for Empty Collection", "Empty Collection Scheduled", "Empty Collected", "Ready for One-Way Loaded Trip", "Ready for Direct Laden Trip", "At Carpark", "Ready for Port Delivery", "Laden Collected", "Delivered to Port"];
  return precedence.find((status) => statuses.includes(status)) || statuses[0] || "Incomplete";
}

function importStatus(job) {
  const trips = activeTrips(job);
  const allTripsDone = trips.length > 0 && trips.every((trip) => trip.status === "Completed");
  const emptyReturn = tripOfType(job, ["Empty Return"]);
  const states = job.containers.map((container) => container.state);
  const deliveredCount = states.filter((state) => state === "Delivered").length;
  const collectedCount = states.filter((state) => state === "Collected").length;

  if (allTripsDone && emptyReturn?.status === "Completed") return "Completed";
  if (deliveredCount > 0 && emptyReturn && emptyReturn.status !== "Completed") return "Empty Return Pending";
  if (deliveredCount === job.containers.length) return "Delivered";
  if (deliveredCount > 0 && deliveredCount < job.containers.length) return "Partially Delivered";
  if (collectedCount === job.containers.length && deliveredCount === 0) return "Collected";
  if (collectedCount > 0 && collectedCount < job.containers.length && deliveredCount === 0) return "Partially Collected";
  if (trips.some((trip) => trip.plannedDate && !trip.collectedTime)) return "Transport Assigned";
  if (job.infoComplete && job.permitReceived && job.portnetReleased) return "Ready for Collection";
  if (job.infoComplete && job.permitReceived && !job.portnetReleased) return "Awaiting Portnet";
  if (job.infoComplete && !job.permitReceived) return "Awaiting Permit";
  return "Incomplete";
}

export function jobStatus(job) {
  return job.type === "Export" ? exportStatus(job) : importStatus(job);
}

function deadlineRisk(job) {
  if (job.type !== "Import" || ["Completed", "Delivered"].includes(jobStatus(job))) return null;
  const emptyReturnPending = jobStatus(job) === "Empty Return Pending";
  const remaining = daysUntil(emptyReturnPending ? job.detentionLastFreeDay : job.demurrageLastFreeDay);
  const clockName = emptyReturnPending ? "Detention free time" : "Last free day";
  if (remaining < 0) return { remaining, text: `${clockName} passed ${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? "" : "s"} ago.` };
  if (remaining === 0) return { remaining, text: `${clockName} ends today.` };
  return null;
}

function overdueTrip(job) {
  return activeTrips(job).find(
    (trip) => trip.plannedDate && daysUntil(trip.plannedDate) < 0 && !trip.collectedTime && trip.status !== "Completed",
  );
}

function internalBlocker(job) {
  const status = jobStatus(job);
  if (!job.infoComplete) return `Job information is incomplete: ${(job.missingInformation || []).join(" and ")}.`;
  if (status === "Awaiting CMS") return "CMS has not been completed.";
  if (status === "Empty Delivered") return "The empty was delivered but its container details were not recorded.";
  if (status === "Awaiting Container Details Notification") return "Container details have not been sent to the customer.";
  if (status === "Carpark Decision Needed") return "The customer has not been asked whether to use the company carpark.";
  if (status === "Delivery Path Needed") return "The company carpark was declined and no laden delivery path has been agreed.";
  if (status === "Ready for Empty Collection") return "The empty collection has not been arranged.";
  if (status === "Ready for One-Way Loaded Trip") return "The one-way loaded trip has not been arranged.";
  if (status === "Ready for Direct Laden Trip") return "The direct laden trip has not been arranged.";
  if (status === "Ready for Port Delivery") return "The carpark-to-port trip has not been arranged.";
  if (status === "Delivered to Port") return "The delivered job has not been closed and its chassis released.";
  if (status === "Empty Return Pending") return "The empty return has not been arranged.";
  if (status === "Ready for Collection") return "The import collection has not been arranged.";
  if (job.type === "Export" && ["Partially Collected", "Partially Delivered"].includes(status)) return `${jobContainers(job).filter((container, index) => !["Completed", "Delivered to Port"].includes(exportContainerStatus(job, container, index))).length} container movements remain outstanding.`;
  if (status === "Transport Assigned" && overdueTrip(job)) return "A planned trip is overdue and has not been collected.";
  return null;
}

function externalBlocker(job) {
  const status = jobStatus(job);
  if (status === "Awaiting Permit") return "The customer has not provided the permit.";
  if (status === "Awaiting Portnet") return "Portnet release has not been confirmed by the carrier.";
  if (status === "Awaiting VGM") return "The customer has not provided the VGM.";
  if (status === "Awaiting Customer Stuffing") return "The customer has not confirmed that stuffing is complete.";
  if (status === "Awaiting T/T") return "The carrier has not confirmed transhipment space.";
  if (status === "Partially Delivered" && !job.permitReceived) return "One container is still waiting for the customer permit.";
  return null;
}

export function blockingReason(job) {
  return deadlineRisk(job)?.text || (overdueTrip(job) ? "A planned trip is overdue." : null) || internalBlocker(job) || externalBlocker(job) || "No blocking issue.";
}

export function waitingOn(job) {
  if (deadlineRisk(job) || overdueTrip(job) || internalBlocker(job)) return "Us";
  const status = jobStatus(job);
  if (job.type === "Export" && ["Partially Collected", "Partially Delivered"].includes(status)) return "Us";
  if (["Awaiting Permit", "Awaiting VGM", "Awaiting Customer Stuffing", "Partially Delivered"].includes(status)) return "Customer";
  if (["Awaiting Portnet", "Awaiting T/T"].includes(status)) return "Carrier";
  return "Nobody";
}

export function nextAction(job) {
  const risk = deadlineRisk(job);
  if (risk) return risk.remaining < 0 ? "Collect immediately and escalate charges" : "Collect today before free time ends";
  if (overdueTrip(job)) return "Contact the transport desk about the overdue trip";

  const status = jobStatus(job);
  const actions = {
    Incomplete: "Complete the missing job information",
    "Awaiting CMS": "Record CMS completed",
    "Empty Delivered": "Record container details",
    "Awaiting Container Details Notification": "Send container details to customer",
    "Empty Collected": "Track the empty delivery",
    "Empty Collection Scheduled": "Dispatch the empty collection",
    "Ready for Empty Collection": "Arrange empty collection",
    "Awaiting Customer Stuffing": "Ask the customer to confirm stuffing is complete",
    "Awaiting VGM": "Ask the customer for VGM",
    "Awaiting T/T": "Confirm transhipment space with the carrier",
    "Carpark Decision Needed": "Ask whether the customer wants the company carpark",
    "Delivery Path Needed": "Agree another laden delivery path with the customer",
    "Ready for One-Way Loaded Trip": "Arrange the one-way loaded trip",
    "Ready for Direct Laden Trip": "Arrange the direct laden-to-port trip",
    "Ready for Port Delivery": "Arrange the carpark-to-port trip",
    "Delivered to Port": "Close the job and release the chassis",
    "Awaiting Permit": "Ask the customer for the permit",
    "Awaiting Portnet": "Follow up on Portnet release",
    "Ready for Collection": "Arrange import collection",
    "Transport Assigned": "Monitor the planned collection",
    "Partially Delivered": "Clear the remaining container for delivery",
    "Partially Collected": "Work the next outstanding container movement",
    "Empty Return Pending": "Arrange empty return before detention ends",
    Delivered: "Arrange the empty return",
    Completed: "No action required",
  };
  return actions[status] || "Review this job";
}

export function location(job) {
  if (jobContainers(job).length > 1) return "Multiple locations";
  const trips = activeTrips(job);
  const latest = [...trips].reverse().find((trip) => ["Collected", "In Transit", "Delivered", "Completed"].includes(trip.status));
  if (latest?.status === "Collected" || latest?.status === "In Transit") return "On the road";
  if (latest && ["Delivered", "Completed"].includes(latest.status)) return latest.route.split("→").at(-1).trim();
  return job.type === "Import" ? job.terminal : job.emptyYard || "Not yet collected";
}

function primaryContainer(job) {
  const containers = jobContainers(job);
  if (containers.length === 1) return containers[0].number || containers[0].ref || "Not yet known";
  return `${containers.length} containers`;
}

function ageInDays(job) {
  return daysHeld(job.createdDate);
}

function ageLabel(job) {
  const days = ageInDays(job);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function requiredBy(job) {
  if (job.type === "Import") {
    const deadline = jobStatus(job) === "Empty Return Pending" ? job.detentionLastFreeDay : job.demurrageLastFreeDay;
    const days = daysUntil(deadline);
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Today";
    return `${days} days`;
  }
  if (waitingOn(job) === "Us") return "Today";
  if (waitingOn(job) === "Customer") return "Customer reply";
  if (waitingOn(job) === "Carrier") return "Carrier reply";
  return "—";
}

function urgency(job) {
  const risk = deadlineRisk(job);
  if (risk) return 10000 - risk.remaining * 50;
  if (overdueTrip(job)) return 9000;
  const owner = waitingOn(job);
  let score = owner === "Us" ? 7000 : owner === "Customer" ? 5000 : owner === "Carrier" ? 4000 : 1000;
  if (job.exception?.open) score += 800;
  if (job.atCarparkSince) score += 600 + daysHeld(job.atCarparkSince) * 10;
  score += ageInDays(job);
  return score;
}

function isActionRequired(job) {
  const status = jobStatus(job);
  if (status === "Completed") return false;
  if (["Ready for Empty Collection", "Ready for Direct Laden Trip", "Ready for One-Way Loaded Trip", "Ready for Port Delivery"].includes(status)) {
    return Boolean(deadlineRisk(job) || overdueTrip(job));
  }
  return waitingOn(job) !== "Nobody" || status === "Delivered to Port";
}

function readiness(job) {
  if (job.type === "Import") {
    const rows = [
      { key: "infoComplete", label: "Job information", ok: job.infoComplete, value: job.infoComplete ? "Complete" : "Missing information" },
      { key: "permitReceived", label: "Permit received", ok: job.permitReceived, value: job.permitReceived ? "Received" : "Not received", actionable: true },
      { key: "portnetReleased", label: "Portnet released", ok: job.portnetReleased, value: job.portnetReleased ? "Released" : "Not released", actionable: true },
    ];
    return { rows, ready: rows.every((row) => row.ok), reason: rows.find((row) => !row.ok)?.label || "All collection checkpoints passed" };
  }

  const containers = jobContainers(job);
  const identified = containers.filter((container) => container.number && container.seal && container.tareKg).length;
  const detailsSent = containers.filter((container) => container.detailsSent).length;
  const customerReady = containers.filter((container) => container.customerReady).length;
  const vgmReady = containers.filter((container) => container.vgmKg && Number(container.vgmKg) > Number(container.tareKg || 0)).length;
  const rows = [
    { key: "infoComplete", label: "Job information", ok: job.infoComplete, value: job.infoComplete ? "Complete" : "Missing information" },
    { key: "cmsCompleted", label: "CMS completed", ok: job.cmsCompleted, value: job.cmsCompleted ? "Completed" : "Pending" },
    { key: "containerDetails", label: "Container identity", ok: identified === containers.length, value: `${identified} / ${containers.length} identified` },
    { key: "detailsSent", label: "Details sent", ok: detailsSent === containers.length, value: `${detailsSent} / ${containers.length} sent` },
    { key: "customerReady", label: "Customer ready", ok: customerReady === containers.length, value: `${customerReady} / ${containers.length} ready` },
    { key: "vgm", label: "VGM validated", ok: vgmReady === containers.length, value: `${vgmReady} / ${containers.length} valid` },
  ];
  const firstMissing = rows.find((row) => !row.ok);
  return { rows, ready: rows.every((row) => row.ok), reason: firstMissing ? `${firstMissing.label}: ${firstMissing.value}` : "Every container has passed its laden gate." };
}

function cloneSeedJobs() {
  return JSON.parse(JSON.stringify(SEED_JOBS)).map((job) => {
    if (job.type === "Import") {
      const containers = (job.containers || []).map((container, index) => ({ ref: container.ref || `C${index + 1}`, ...container }));
      return {
        ...job,
        containers,
        trips: (job.trips || []).map((trip, index) => {
          if (trip.containerRef || trip.containerNumber || trip.type === "Empty Return") return trip;
          const container = containers[Math.min(index, containers.length - 1)];
          return { ...trip, containerRef: container?.ref, containerNumber: container?.number };
        }),
      };
    }
    const quantity = Math.min(MAX_CONTAINERS_PER_JOB, Math.max(1, Number(job.containerQuantity || job.containers?.length || 1)));
    const existing = Array.isArray(job.containers) ? job.containers : [];
    const containers = Array.from({ length: quantity }, (_, index) => ({
      ref: `C${index + 1}`,
      number: "",
      seal: "",
      tareKg: null,
      vgmKg: null,
      sizeType: job.containerSizeType || "",
      stuffingLocation: job.deliveryAddress || "",
      detailsSent: Boolean(job.detailsSent),
      customerReady: Boolean(job.customerReady),
      ...(index === 0 ? job.container || {} : {}),
      ...(existing[index] || {}),
    }));
    return {
      ...job,
      containers,
      containerQuantity: containers.length,
      container: { ...containers[0] },
      trips: (job.trips || []).map((trip) => trip.containerRef || trip.containerNumber ? trip : { ...trip, containerRef: "C1", containerNumber: containers[0].number || undefined }),
    };
  });
}

function statusTone(status) {
  if (["Completed", "Delivered", "Delivered to Port", "Ready for Collection", "Ready for Empty Collection", "Ready for Port Delivery", "Ready for Direct Laden Trip", "Ready for One-Way Loaded Trip"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["Incomplete", "Empty Delivered", "Carpark Decision Needed", "Delivery Path Needed"].includes(status)) return "border-rose-200 bg-rose-50 text-rose-800";
  if (["Awaiting VGM", "Awaiting Permit", "Awaiting Customer Stuffing", "Partially Delivered", "Partially Collected"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function tripStatusTone(trip) {
  if (trip.status === "Pending") return "border-slate-200 bg-slate-100 text-slate-700";
  if (trip.status === "Cancelled") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function dwellTone(days) {
  if (days > 5) return "border-rose-200 bg-rose-50 text-rose-800";
  if (days > 3) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function WaitingPill({ owner }) {
  const tones = {
    Us: "border-rose-200 bg-rose-50 text-rose-800",
    Customer: "border-amber-200 bg-amber-50 text-amber-800",
    Carrier: "border-slate-200 bg-slate-100 text-slate-700",
    Nobody: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return <span className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-base font-semibold ${tones[owner]}`}>{owner}</span>;
}

function StatusPill({ status, large = false, flash = false }) {
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold ${large ? "min-h-12 px-5 py-2 text-[18px]" : "min-h-9 px-3 py-1 text-base"} ${statusTone(status)} ${flash ? "greenlit-release-flash" : ""}`}>
      {status}
    </span>
  );
}

function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CounterCard({ label, value, note, icon: Icon, tone = "navy", onClick }) {
  const iconTone = tone === "red" ? "bg-rose-50 text-rose-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-[#17418c]";
  return (
    <button type="button" onClick={onClick} className="group flex h-full min-h-20 w-full flex-col justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-[border-color,background-color] duration-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 sm:min-h-28 sm:px-4 sm:py-4">
      {/* Count and icon share one baseline row so the chip never floats free of
          the numeral it belongs to. */}
      <div className="flex items-center justify-between gap-2">
        <span className="greenlit-display text-2xl font-semibold tabular-nums tracking-[-0.02em] text-slate-950 sm:text-3xl">{value}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md sm:h-9 sm:w-9 ${iconTone}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        </span>
      </div>
      {/* Label and note occupy reserved slots. Without this a three-line label
          ("Waiting on customer") makes its card taller than its neighbours and
          the row develops a ragged bottom edge. */}
      <div className="mt-2">
        <div className="flex min-h-[2.75rem] items-start text-base font-semibold leading-tight text-slate-700">{label}</div>
        <div className="mt-1 hidden min-h-[1.5rem] text-base font-medium leading-snug text-slate-500 sm:block">{note ?? ""}</div>
      </div>
    </button>
  );
}

/**
 * Maps a seed job to the neutral row shape by running the in-component
 * derivation. The live path maps from the API instead — see rowsFromApi.
 */
function rowFromSeedJob(job) {
  return {
    id: job.id,
    type: job.type,
    container: primaryContainer(job),
    status: jobStatus(job),
    blocking: blockingReason(job),
    nextAction: nextAction(job),
    waitingOn: waitingOn(job),
    age: ageLabel(job),
    requiredBy: requiredBy(job),
    openable: true,
  };
}

/**
 * Presentational only. It renders whatever derived values it is handed and
 * computes none of its own, so the same table can show seed data or values
 * computed server-side by @greenlit/engine.
 */
function ActionTable({ rows, onOpen, compact = false }) {
  const jobs = rows;
  if (!jobs.length) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-700" aria-hidden="true" />
        <p className="text-xl font-semibold text-slate-950">No jobs match this filter.</p>
        <p className="text-[18px] text-slate-700">Choose another filter to continue.</p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[1180px] border-collapse text-left text-[18px]">
          <thead className="bg-[#172a3a] text-white">
            <tr>
              {[
                "Job",
                "Container",
                "Status",
                "What is blocking it",
                "Next action",
                "Waiting on",
                ...(compact ? [] : ["Age", "Required by"]),
                "",
              ].map((heading, index) => (
                <th key={`${heading}-${index}`} className="border-r border-slate-600 px-4 py-4 text-base font-semibold last:border-r-0">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-slate-200 align-top even:bg-slate-50/70 hover:bg-sky-50/70">
                <td className="px-4 py-4">
                  <button type="button" onClick={() => onOpen(job.id)} className="min-h-11 text-left font-semibold text-[#17418c] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600">
                    {job.id}
                  </button>
                  <div className="mt-1 font-semibold text-slate-700">{job.type}</div>
                </td>
                <td className="px-4 py-4 font-semibold text-slate-950">{job.container}</td>
                <td className="px-4 py-4"><StatusPill status={job.status} /></td>
                <td className="max-w-[270px] px-4 py-4 font-normal leading-snug text-slate-600">{job.blocking}</td>
                <td className="max-w-[260px] px-4 py-4 font-semibold leading-snug text-slate-950">{job.nextAction}</td>
                <td className="px-4 py-4"><WaitingPill owner={job.waitingOn} /></td>
                {!compact ? <td className="px-4 py-4 font-semibold tabular-nums text-slate-950">{job.age}</td> : null}
                {!compact ? <td className="px-4 py-4 font-semibold text-slate-950">{job.requiredBy}</td> : null}
                <td className="px-4 py-4">
                  <button type="button" onClick={() => onOpen(job.id)} aria-label={`Open ${job.id}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-300 text-[#17418c] hover:border-slate-400 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600">
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-200 xl:hidden">
        {jobs.map((job) => (
          <button key={job.id} type="button" onClick={() => onOpen(job.id)} className="block min-h-44 w-full px-5 py-5 text-left transition-colors duration-200 hover:bg-sky-50/70 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-600">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-[#17418c] underline decoration-1 underline-offset-4">{job.id}</div>
                <div className="mt-1 font-semibold text-slate-700">{job.container} · {job.type}</div>
              </div>
              <StatusPill status={job.status} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div><span className="font-semibold text-slate-500">Blocking: </span><span className="font-normal text-slate-600">{job.blocking}</span></div>
              <div><span className="font-semibold text-slate-500">Next: </span><span className="font-semibold text-slate-950">{job.nextAction}</span></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <WaitingPill owner={job.waitingOn} />
              {!compact ? <span className="font-semibold text-slate-800">Age {job.age} · Required {job.requiredBy}</span> : null}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function TripTable({ trips, flashTripId, onOpenTrip }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1160px] border-collapse text-left text-[18px]">
        <thead className="bg-[#172a3a] text-white">
          <tr>
            {["Reference", "Container", "Route", "Type", "Status", "Planned date", "Collected", "Delivered", ""].map((heading, index) => (
              <th key={`${heading}-${index}`} className="border-r border-slate-600 px-4 py-4 text-base font-semibold last:border-r-0">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trips.length ? trips.map((trip) => {
            const pending = trip.status === "Pending";
            const cancelled = trip.status === "Cancelled";
            return (
              <tr key={trip.id} className={`border-b border-slate-200 align-top ${pending ? "bg-slate-50" : "bg-white"} ${cancelled ? "line-through opacity-75" : ""} ${flashTripId === trip.id ? "greenlit-new-row" : ""}`}>
                <td className="px-4 py-4 font-extrabold text-slate-950">
                  {trip.id}
                  {trip.createdAutomatically ? <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-base font-semibold text-emerald-800"><CircleDot className="h-4 w-4" />Created automatically</div> : null}
                </td>
                <td className="px-4 py-4"><div className="font-semibold text-slate-950">{trip.containerRef || "—"}</div><div className="mt-1 break-all text-base font-medium text-slate-600">{trip.containerNumber || "Identity pending"}</div></td>
                <td className="max-w-[260px] px-4 py-4 font-semibold text-slate-900">{trip.route}</td>
                <td className="px-4 py-4 font-semibold text-slate-950">{trip.type}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1 font-semibold ${tripStatusTone(trip)}`}>{trip.status}</span>
                  {pending && !trip.plannedDate ? <div className="mt-2 font-semibold text-slate-700">Not yet scheduled</div> : null}
                  {cancelled ? <div className="mt-2 font-semibold text-red-900">{trip.cancelledReason}</div> : null}
                </td>
                <td className="px-4 py-4 font-semibold text-slate-900">{trip.plannedDate ? new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(parseDay(trip.plannedDate)) : "Not scheduled"}</td>
                <td className="px-4 py-4 font-semibold text-slate-900">{trip.collectedTime || "—"}</td>
                <td className="px-4 py-4 font-semibold text-slate-900">{trip.deliveredTime || "—"}</td>
                <td className="px-4 py-4"><button type="button" onClick={() => onOpenTrip(trip.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 font-semibold text-[#17418c] hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Manage <ChevronRight className="h-5 w-5" /></button></td>
              </tr>
            );
          }) : (
            <tr><td colSpan="9" className="px-5 py-8 text-center text-[18px] font-semibold text-slate-700">No trips have been created for this job. Use “Add trip” to arrange the next movement.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatKg(value) {
  return value ? `${value.toLocaleString()} kg` : "Not yet known";
}

function freeTimeTone(days) {
  if (days < 0) return "border-rose-800 bg-rose-800 text-white";
  if (days <= 1) return "border-rose-200 bg-rose-50 text-rose-800";
  if (days <= 3) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function freeTimeLabel(days) {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past`;
  if (days === 0) return "Today — 0 days left";
  return `${days} day${days === 1 ? "" : "s"} left`;
}


const WAITING_LABEL = { US: "Us", CUSTOMER: "Customer", CARRIER: "Carrier", NOBODY: "Nobody" };

/** Maps a DerivedJobView from /api into the neutral row shape. */
function rowsFromApi(jobs) {
  return jobs.map((j) => ({
    id: j.jobNumber,
    type: j.domain === "IMPORT" ? "Import" : "Export",
    container: j.containers?.[0]?.containerNumber ?? "Not yet known",
    status: j.jobStatus,
    blocking: j.blockingReason ?? "—",
    nextAction: j.nextActionRequired,
    waitingOn: WAITING_LABEL[j.waitingOn] ?? "Nobody",
    age: "—",
    requiredBy: "—",
    openable: false,
  }));
}

/**
 * Reads the Action Required queue from the server, where @greenlit/engine
 * computes it. Returns null while loading or if the API is unavailable, and
 * the caller falls back to seed derivation so the screen never breaks.
 */
function useLiveActionRows() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/queues/action-required")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (!cancelled) setRows(rowsFromApi(data.jobs ?? [])); })
      .catch(() => { if (!cancelled) setRows(null); });
    return () => { cancelled = true; };
  }, []);
  return rows;
}

function Dashboard({ jobs, actionJobs, chassis, onOpen, onShowActions, onShowFleet }) {
  const liveRows = useLiveActionRows();
  const activeJobs = jobs.filter((job) => jobStatus(job) !== "Completed");
  const blockedJobs = activeJobs.filter((job) => !readiness(job).ready);
  const waitingUs = actionJobs.filter((job) => waitingOn(job) === "Us");
  const waitingCustomer = actionJobs.filter((job) => waitingOn(job) === "Customer");
  const exceptions = jobs.filter((job) => job.exception?.open);
  const atCarpark = jobs.filter((job) => location(job) === CARPARK);
  const freeRisk = jobs.filter((job) => job.type === "Import" && !["Delivered", "Empty Return Pending", "Completed"].includes(jobStatus(job)) && daysUntil(job.demurrageLastFreeDay) <= 3);
  const heldBeyondFive = chassis.inUse.filter((item) => item.days > 5).length;

  const cards = [
    { label: "Waiting on us", value: waitingUs.length, icon: AlertTriangle, tone: waitingUs.length ? "red" : "green", filter: "us" },
    { label: "Free time at risk", value: freeRisk.length, icon: CalendarDays, tone: freeRisk.length ? "red" : "green", filter: "freeTime" },
    { label: "Blocked jobs", value: blockedJobs.length, icon: ShieldCheck, tone: blockedJobs.length ? "red" : "green", filter: "blocked" },
    { label: "Waiting on customer", value: waitingCustomer.length, icon: Clock3, tone: waitingCustomer.length ? "amber" : "green", filter: "customer" },
    { label: "Exceptions open", value: exceptions.length, icon: XCircle, tone: exceptions.length ? "red" : "green", filter: "exceptions" },
    { label: "At our carpark", value: atCarpark.length, icon: Warehouse, tone: atCarpark.length ? "amber" : "green", filter: "carpark" },
    { label: "Active jobs", value: activeJobs.length, icon: ListTodo, filter: "active" },
    { label: "Chassis available", value: chassis.available.length, note: `${heldBeyondFive} held >5 days`, icon: Truck, tone: "green", fleet: true },
  ];

  return (
    <main id="main-content" className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">Today’s control tower</h1>
          <p className="mt-2 max-w-[72ch] text-[18px] font-normal text-slate-600">Start with work waiting on us, then protect free time and carpark capacity.</p>
        </div>
        <div className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-base font-medium text-slate-600">
          <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
          Wednesday, 19 August 2026
        </div>
      </div>

      <section aria-label="Live operation counts" className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 xl:grid-cols-8">
        {cards.map((card) => (
          <div key={card.label}>
            <CounterCard {...card} onClick={() => card.fleet ? onShowFleet() : onShowActions(card.filter)} />
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-6 sm:mt-6">
        <Panel
          title="Action Required"
          action={<button type="button" onClick={() => onShowActions("all")} className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold text-[#17418c] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600">View full list <ChevronRight className="h-5 w-5" /></button>}
        >
          <ActionTable rows={(liveRows ?? actionJobs.map(rowFromSeedJob)).slice(0, 6)} onOpen={onOpen} compact />
        </Panel>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Containers at our carpark">
            <div className="divide-y divide-slate-200">
              {atCarpark.map((job) => {
                const dwell = daysHeld(job.atCarparkSince);
                const tone = dwellTone(dwell);
                return (
                  <button key={job.id} type="button" onClick={() => onOpen(job.id)} className="grid min-h-32 w-full gap-4 px-5 py-5 text-left transition-colors duration-200 hover:bg-sky-50/70 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-600 md:grid-cols-[1fr_auto]">
                    <div>
                      <div className="text-xl font-semibold text-[#17418c] underline decoration-1 underline-offset-4">{primaryContainer(job)}</div>
                      <div className="mt-2 text-[18px] font-semibold text-slate-800">{job.id} · Chassis {job.chassis[0].unit}</div>
                      <div className="mt-2 font-semibold text-slate-950">Transhipment: {job.transhipment === "pending" ? "Pending" : "Available"}</div>
                    </div>
                    <div className={`flex min-h-20 min-w-32 flex-col items-center justify-center rounded-md border px-4 py-3 text-center ${tone}`}>
                      <div className="text-2xl font-semibold tabular-nums">Day {dwell}</div>
                      <div className="text-base font-medium">at carpark</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Import free time">
            <div className="divide-y divide-slate-200">
              {jobs.filter((job) => job.type === "Import" && !["Delivered", "Empty Return Pending", "Completed"].includes(jobStatus(job))).sort((a, b) => daysUntil(a.demurrageLastFreeDay) - daysUntil(b.demurrageLastFreeDay)).map((job) => {
                const days = daysUntil(job.demurrageLastFreeDay);
                return (
                  <button key={job.id} type="button" onClick={() => onOpen(job.id)} className="flex min-h-24 w-full flex-wrap items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-sky-50/70 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-600">
                    <div>
                      <div className="text-xl font-semibold text-[#17418c] underline decoration-1 underline-offset-4">{primaryContainer(job)}</div>
                      <div className="mt-1 text-[18px] font-semibold text-slate-800">{job.id} · {job.terminal}</div>
                    </div>
                    <span className={`inline-flex min-h-12 items-center rounded-md border px-4 py-2 text-[18px] font-semibold ${freeTimeTone(days)}`}>{freeTimeLabel(days)}</span>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel title="Chassis availability" action={<button type="button" onClick={onShowFleet} className="min-h-11 px-2 font-semibold text-[#17418c] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600">Open fleet register</button>}>
          <div className="grid md:grid-cols-2">
            {["20ft", "40ft"].map((size, index) => {
              const available = chassis.available.filter((item) => item.size === size).length;
              const held = chassis.inUse.filter((item) => item.size === size && item.days > 5).length;
              return (
                <div key={size} className={`flex min-h-40 items-center justify-between gap-5 p-6 ${index === 0 ? "border-b border-slate-200 md:border-b-0 md:border-r" : ""}`}>
                  <div>
                    <div className="text-[18px] font-semibold text-slate-700">{size} available</div>
                    <div className="mt-1 text-5xl font-semibold tabular-nums tracking-[-0.03em] text-[#17418c]">{available}</div>
                    <div className="mt-2 text-[18px] font-semibold text-slate-900">out of {CHASSIS_TOTALS[size]}</div>
                  </div>
                  <div className={`rounded-md border px-5 py-4 text-center ${held ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                    <div className="text-2xl font-semibold tabular-nums">{held}</div>
                    <div className="max-w-36 text-base font-medium">held beyond 5 days</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </main>
  );
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "us", label: "Waiting on us" },
  { id: "customer", label: "Waiting on customer" },
  { id: "carrier", label: "Waiting on carrier" },
  { id: "import", label: "Import" },
  { id: "export", label: "Export" },
];

function ActionRequired({ jobs, filter, setFilter, dashboardFilter, clearDashboardFilter, onOpen }) {
  const filtered = jobs.filter((job) => {
    if (dashboardFilter === "active" && jobStatus(job) === "Completed") return false;
    if (dashboardFilter === "blocked" && readiness(job).ready) return false;
    if (dashboardFilter === "exceptions" && !job.exception?.open) return false;
    if (dashboardFilter === "carpark" && location(job) !== CARPARK) return false;
    if (dashboardFilter === "freeTime" && !(job.type === "Import" && !["Delivered", "Empty Return Pending", "Completed"].includes(jobStatus(job)) && daysUntil(job.demurrageLastFreeDay) <= 3)) return false;
    if (filter === "us") return waitingOn(job) === "Us";
    if (filter === "customer") return waitingOn(job) === "Customer";
    if (filter === "carrier") return waitingOn(job) === "Carrier";
    if (filter === "import") return job.type === "Import";
    if (filter === "export") return job.type === "Export";
    return true;
  });

  const dashboardLabels = { active: "Active jobs", blocked: "Blocked jobs", exceptions: "Exceptions open", carpark: "At our carpark", freeTime: "Free time at risk" };

  return (
    <main id="main-content" className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="pb-2">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">Action Required</h1>
        <p className="mt-2 text-[18px] font-normal text-slate-600">Work top to bottom. Doing the action removes the row.</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3" aria-label="Action filters">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" onClick={() => { setFilter(item.id); clearDashboardFilter(); }} aria-pressed={filter === item.id && !dashboardFilter} className={`min-h-12 rounded-md border px-5 py-2 text-[18px] font-semibold focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${filter === item.id && !dashboardFilter ? "border-[#17418c] bg-[#17418c] text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}>
            {item.label}
          </button>
        ))}
      </div>

      {dashboardFilter ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-[18px] font-medium text-sky-900">
          Dashboard filter: {dashboardLabels[dashboardFilter] || dashboardFilter}
          <button type="button" onClick={clearDashboardFilter} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-sky-300 bg-white px-3 font-semibold text-[#17418c] focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600"><X className="h-5 w-5" />Clear</button>
        </div>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Urgency-ranked action list">
        <ActionTable rows={filtered.map(rowFromSeedJob)} onOpen={onOpen} />
      </section>
    </main>
  );
}

function DetailField({ label, value, flash = false }) {
  return (
    <div className={`min-h-24 border-b border-r border-slate-200 p-4 ${flash ? "greenlit-release-flash" : ""}`}>
      <div className="text-base font-medium text-slate-500">{label}</div>
      <div className="mt-2 break-words text-[18px] font-semibold text-slate-900">{value}</div>
    </div>
  );
}

const drawerInputClass = "mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[18px] font-medium text-slate-950 outline-none focus:border-[#17418c] focus:outline focus:outline-4 focus:outline-offset-1 focus:outline-sky-600";

function DrawerField({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-base font-semibold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-base font-medium text-slate-500">{hint}</span> : null}
    </label>
  );
}

function ChoiceGroup({ label, value, options, onChange }) {
  return (
    <fieldset>
      <legend className="text-base font-semibold text-slate-700">{label}</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={`min-h-14 rounded-md border px-4 py-3 text-left text-[18px] font-semibold focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${value === option.value ? "border-[#17418c] bg-[#17418c] text-white" : "border-slate-300 bg-white text-slate-800 hover:border-[#17418c]"}`}>
            <span className="block">{option.label}</span>
            {option.note ? <span className={`mt-1 block text-base font-medium ${value === option.value ? "text-sky-100" : "text-slate-500"}`}>{option.note}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function suggestedTripDraft(job) {
  const reference = nextTripReference(job.trips || []);
  if (job.type === "Import") {
    const needsReturn = (job.containers || []).every((container) => container.state === "Delivered");
    const targetContainer = job.containers?.find((container) => container.state !== "Delivered") || job.containers?.[0];
    return needsReturn ? {
      id: reference,
      type: "Empty Return",
      route: `${job.deliveryAddress} → ${job.emptyYard || "Empty depot to confirm"}`,
      status: "Pending",
      plannedDate: "",
      containerRef: job.containers?.[0]?.ref || "",
      containerNumber: job.containers?.[0]?.number || "",
    } : {
      id: reference,
      type: "Import Delivery",
      route: `${job.terminal} → ${job.deliveryAddress}`,
      status: "Pending",
      plannedDate: "",
      containerRef: targetContainer?.ref || "",
      containerNumber: targetContainer?.number || "",
    };
  }

  const containers = jobContainers(job);
  const target = containers.find((container, index) => !activeTrips(job).some((trip) => movementMatchesContainer(trip, container, index, containers.length) && ["Direct Laden to Port", "One-Way Loaded", "Carpark to Port"].includes(trip.type))) || containers[0];
  const containerFields = { containerRef: target?.ref || "", containerNumber: target?.number || "" };
  const emptyExists = (job.trips || []).some((trip) => trip.type === "Empty Collection" && trip.status !== "Cancelled");
  if (!emptyExists) return { id: reference, type: "Empty Collection", route: `${job.emptyYard} → ${target?.stuffingLocation || job.deliveryAddress}`, status: "Pending", plannedDate: "", ...containerFields };
  if (job.atCarparkSince) return { id: reference, type: "Carpark to Port", route: `${CARPARK} → PSA Tuas`, status: "Pending", plannedDate: "", ...containerFields };
  if (job.transhipment === "not_available" && job.carparkRequested) return { id: reference, type: "One-Way Loaded", route: `${target?.stuffingLocation || job.deliveryAddress} → ${CARPARK}`, status: "Pending", plannedDate: "", ...containerFields };
  return { id: reference, type: "Direct Laden to Port", route: `${target?.stuffingLocation || job.deliveryAddress} → PSA Tuas`, status: "Pending", plannedDate: "", ...containerFields };
}

function initialDrawerDraft(panel, job) {
  if (!panel) return {};
  if (panel.type === "job" && job) return {
    customer: job.customer || "",
    booking: job.booking || "",
    vessel: job.vessel || "",
    deliveryAddress: job.deliveryAddress || "",
    operatingLocation: job.type === "Import" ? job.terminal || "" : job.emptyYard || "",
  };
  if (panel.type === "checkpoint" && job) return {
    value: panel.key === "transhipment" ? job.transhipment || "pending" : panel.key === "deliveryPath" ? (job.carparkRequested ? "carpark" : "other") : Boolean(job[panel.key]),
  };
  if (panel.type === "container" && job?.type === "Export") {
    if (panel.mode === "new") return { number: "", seal: "", tareKg: "", vgmKg: "", sizeType: job.containerSizeType || "", stuffingLocation: job.deliveryAddress || "", detailsSent: false, customerReady: false };
    const container = jobContainers(job)[panel.index || 0];
    return {
      number: container.number || "",
      seal: container.seal || "",
      tareKg: container.tareKg ?? "",
      vgmKg: container.vgmKg ?? "",
      sizeType: container.sizeType || job.containerSizeType || "",
      stuffingLocation: container.stuffingLocation || job.deliveryAddress || "",
      detailsSent: Boolean(container.detailsSent),
      customerReady: Boolean(container.customerReady),
    };
  }
  if (panel.type === "container" && job?.type === "Import") {
    if (panel.mode === "new") return { number: "", type: "", seal: "", state: job.permitReceived ? "Ready" : "Awaiting permit", lastFreeDay: job.demurrageLastFreeDay || "" };
    const container = job.containers[panel.index || 0];
    return { number: container.number, type: container.type || "", seal: container.seal || "", state: container.state, lastFreeDay: container.lastFreeDay || job.demurrageLastFreeDay || "" };
  }
  if (panel.type === "trip" && job) {
    const trip = job.trips.find((item) => item.id === panel.tripId);
    return trip ? { ...trip } : suggestedTripDraft(job);
  }
  if (panel.type === "chassis") return { jobId: panel.jobId || "", action: panel.condition === "assigned" ? "release" : panel.condition === "maintenance" ? "return" : "assign" };
  if (panel.type === "freeTime" && job) return { demurrageLastFreeDay: job.demurrageLastFreeDay, detentionLastFreeDay: job.detentionLastFreeDay };
  return {};
}

function panelHeading(panel, job) {
  const checkpointNames = {
    permitReceived: "Update permit",
    portnetReleased: "Update Portnet release",
    cmsCompleted: "Update CMS",
    detailsSent: "Update customer notification",
    customerReady: "Update customer readiness",
    transhipment: "Set transhipment",
    deliveryPath: "Set delivery path",
  };
  if (panel.type === "job") return { title: "Edit job information", note: "These facts drive readiness, location, and the next action." };
  if (panel.type === "checkpoint") return { title: checkpointNames[panel.key] || "Update checkpoint", note: "Saving this recalculates the job status and action queue." };
  if (panel.type === "container") return { title: panel.mode === "new" ? "Add container" : "Manage container", note: `Container progress and movements remain under the same job. Maximum ${MAX_CONTAINERS_PER_JOB} containers.` };
  if (panel.type === "trip") return { title: panel.tripId ? `Update ${panel.tripId}` : "Create a trip", note: "Trip progress updates location, container state, and chassis availability." };
  if (panel.type === "chassis") return { title: `Chassis ${panel.unit}`, note: panel.condition === "available" ? "Assign this available unit to active work." : panel.condition === "maintenance" ? "Return this unit to the available fleet after inspection." : "Release this unit when the job no longer needs it." };
  if (panel.type === "freeTime") return { title: "Confirm free-time dates", note: "Confirmed dates replace provisional document-based estimates." };
  if (panel.type === "activity") return { title: "Job activity", note: "Every simulated operational change appears here." };
  if (panel.type === "source") return { title: "Extracted document facts", note: `${job?.sourceDocument?.fileName || "Arrival notice"} · processed on this device.` };
  return { title: "Manage work", note: "" };
}

function OperationsDrawer({ panel, jobs, onClose, onCommit }) {
  const job = jobs.find((item) => item.id === panel?.jobId);
  const [draft, setDraft] = useState(() => initialDrawerDraft(panel, job));
  const heading = panel ? panelHeading(panel, job) : { title: "", note: "" };

  useEffect(() => {
    setDraft(initialDrawerDraft(panel, job));
  }, [panel?.type, panel?.jobId, panel?.key, panel?.index, panel?.mode, panel?.tripId, panel?.unit]);

  useEffect(() => {
    if (!panel) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [panel, onClose]);

  if (!panel) return null;
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const activeJobs = jobs.filter((item) => jobStatus(item) !== "Completed");
  const isReadOnly = ["activity", "source"].includes(panel.type);
  const containerRecords = job ? jobContainers(job) : [];
  const draftContainerNumber = String(draft.number || "").toUpperCase().replace(/\s+/g, "");
  const duplicateContainerNumber = panel.type === "container" && draftContainerNumber && containerRecords.some((container, index) => index !== panel.index && String(container.number || "").toUpperCase().replace(/\s+/g, "") === draftContainerNumber);
  const selectedContainer = panel.type === "container" && panel.mode !== "new" ? containerRecords[panel.index || 0] : null;
  const selectedContainerHasMovement = selectedContainer ? (job?.trips || []).some((trip) => trip.status !== "Cancelled" && ((trip.containerRef && trip.containerRef === selectedContainer.ref) || (trip.containerNumber && trip.containerNumber === selectedContainer.number) || (!trip.containerRef && !trip.containerNumber && containerRecords.length === 1))) : false;
  const canRemoveContainer = panel.type === "container" && panel.mode !== "new" && containerRecords.length > 1 && !selectedContainerHasMovement;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-[#0f2333]/45" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="operations-drawer-title" className="greenlit-drawer flex h-full w-full max-w-[680px] flex-col overflow-hidden border-l border-slate-300 bg-[#f4f6f8] shadow-[-20px_0_50px_rgba(15,35,51,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-700 bg-[#172a3a] px-5 py-5 text-white">
          <div className="min-w-0">
            <h2 id="operations-drawer-title" className="text-2xl font-semibold tracking-[-0.02em]">{heading.title}</h2>
            <p className="mt-2 text-base font-medium text-slate-200">{heading.note}</p>
            {job ? <div className="mt-3 inline-flex min-h-8 items-center rounded-full border border-slate-500 bg-[#0f2333] px-3 text-base font-semibold text-slate-100">{job.id} · {job.customer}</div> : null}
          </div>
          <button type="button" onClick={onClose} autoFocus aria-label="Close management panel" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-slate-500 text-slate-100 hover:bg-[#0f2333] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-400"><X className="h-6 w-6" /></button>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); if (isReadOnly) onClose(); else onCommit(panel, draft); }} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {panel.type === "job" && job ? (
              <div className="grid gap-5">
                <DrawerField label="Customer"><input required value={draft.customer || ""} onChange={(event) => update("customer", event.target.value)} className={drawerInputClass} /></DrawerField>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DrawerField label="Booking / reference"><input value={draft.booking || ""} onChange={(event) => update("booking", event.target.value)} className={drawerInputClass} /></DrawerField>
                  <DrawerField label="Vessel / voyage"><input value={draft.vessel || ""} onChange={(event) => update("vessel", event.target.value)} className={drawerInputClass} /></DrawerField>
                </div>
                <DrawerField label={job.type === "Import" ? "Discharging terminal" : "Empty collection yard"}><input required value={draft.operatingLocation || ""} onChange={(event) => update("operatingLocation", event.target.value)} className={drawerInputClass} /></DrawerField>
                <DrawerField label="Customer delivery address"><textarea required rows={3} value={draft.deliveryAddress || ""} onChange={(event) => update("deliveryAddress", event.target.value)} className={drawerInputClass} /></DrawerField>
              </div>
            ) : null}

            {panel.type === "checkpoint" ? (
              panel.key === "transhipment" ? <ChoiceGroup label="Carrier response" value={draft.value} onChange={(value) => update("value", value)} options={[{ value: "available", label: "Available", note: "Plan a direct or final port trip." }, { value: "not_available", label: "Not available", note: "Choose another laden delivery path." }, { value: "pending", label: "Still pending", note: "Keep the job waiting on the carrier." }]} />
                : panel.key === "deliveryPath" ? <ChoiceGroup label="Agreed path" value={draft.value} onChange={(value) => update("value", value)} options={[{ value: "carpark", label: "Use company carpark", note: "Create the one-way loaded branch." }, { value: "other", label: "Another path needed", note: "Keep the job blocked for follow-up." }]} />
                  : <ChoiceGroup label="Checkpoint state" value={draft.value} onChange={(value) => update("value", value)} options={[{ value: true, label: "Complete / received", note: "Release this checkpoint." }, { value: false, label: "Outstanding", note: "Keep this checkpoint open." }]} />
            ) : null}

            {panel.type === "container" && job?.type === "Export" ? (
              <div className="grid gap-5">
                <div className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-4 py-3"><div><div className="text-base font-semibold text-slate-500">Container reference</div><div className="mt-1 text-xl font-semibold text-slate-950">{panel.mode === "new" ? `C${containerRecords.length + 1}` : selectedContainer?.ref || `C${(panel.index || 0) + 1}`}</div></div><div className="text-right text-base font-semibold text-slate-600">{containerRecords.length} / {MAX_CONTAINERS_PER_JOB} on job</div></div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DrawerField label="Container number" hint="May remain blank until the empty is collected."><input maxLength={11} pattern="[A-Za-z]{4}[0-9]{7}" value={draft.number || ""} onChange={(event) => update("number", event.target.value)} className={drawerInputClass} /></DrawerField>
                  <DrawerField label="Size / type"><input required value={draft.sizeType || ""} onChange={(event) => update("sizeType", event.target.value)} className={drawerInputClass} placeholder="40 HQ" /></DrawerField>
                  <DrawerField label="Seal number"><input value={draft.seal || ""} onChange={(event) => update("seal", event.target.value)} className={drawerInputClass} /></DrawerField>
                  <DrawerField label="Tare weight (kg)"><input min="1" type="number" inputMode="numeric" value={draft.tareKg ?? ""} onChange={(event) => update("tareKg", event.target.value)} className={drawerInputClass} /></DrawerField>
                  <DrawerField label="VGM (kg)" hint="May remain blank until the customer provides it."><input min="1" type="number" inputMode="numeric" value={draft.vgmKg ?? ""} onChange={(event) => update("vgmKg", event.target.value)} className={drawerInputClass} /></DrawerField>
                </div>
                <DrawerField label="Stuffing location" hint="Each container may use a different customer site."><textarea required rows={2} value={draft.stuffingLocation || ""} onChange={(event) => update("stuffingLocation", event.target.value)} className={drawerInputClass} /></DrawerField>
                <ChoiceGroup label="Details sent to customer" value={Boolean(draft.detailsSent)} onChange={(value) => update("detailsSent", value)} options={[{ value: true, label: "Sent", note: "This container may proceed to stuffing." }, { value: false, label: "Not sent", note: "Keep this container waiting on us." }]} />
                <ChoiceGroup label="Customer confirms container ready" value={Boolean(draft.customerReady)} onChange={(value) => update("customerReady", value)} options={[{ value: true, label: "Ready", note: "Validate VGM before laden movement." }, { value: false, label: "Not ready", note: "Keep this container waiting on the customer." }]} />
                {duplicateContainerNumber ? <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-4 text-[18px] font-semibold text-rose-900">{draftContainerNumber} is already on this job. Every container number must be unique.</div> : null}
              </div>
            ) : null}

            {panel.type === "container" && job?.type === "Import" ? (
              <div className="grid gap-5">
                <DrawerField label="Container number"><input required maxLength={11} pattern="[A-Za-z]{4}[0-9]{7}" value={draft.number || ""} onChange={(event) => update("number", event.target.value)} className={drawerInputClass} /></DrawerField>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DrawerField label="Container type"><input value={draft.type || ""} onChange={(event) => update("type", event.target.value)} className={drawerInputClass} placeholder="20' General Purpose" /></DrawerField>
                  <DrawerField label="Seal number"><input value={draft.seal || ""} onChange={(event) => update("seal", event.target.value)} className={drawerInputClass} /></DrawerField>
                </div>
                <DrawerField label="Operational state"><select value={draft.state || ""} onChange={(event) => update("state", event.target.value)} className={drawerInputClass}>{["At terminal", "Awaiting permit", "Ready", "Collected", "Delivered"].map((state) => <option key={state}>{state}</option>)}</select></DrawerField>
                <DrawerField label="Container last free day"><input required type="date" value={draft.lastFreeDay || ""} onChange={(event) => update("lastFreeDay", event.target.value)} className={drawerInputClass} /></DrawerField>
                <div className="rounded-md border border-sky-200 bg-sky-50 p-4 text-[18px] font-medium text-sky-900">Marking a container collected or delivered also updates its linked delivery trip. Delivering every container creates the empty-return trip automatically.</div>
                {duplicateContainerNumber ? <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-4 text-[18px] font-semibold text-rose-900">{draftContainerNumber} is already on this job. Every container number must be unique.</div> : null}
              </div>
            ) : null}

            {panel.type === "container" && panel.mode !== "new" && selectedContainerHasMovement && containerRecords.length > 1 ? (
              <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-[18px] font-medium text-amber-950">This container has a linked movement, so it cannot be removed from the job. Cancel or resolve that movement first.</div>
            ) : null}

            {panel.type === "trip" && job ? (
              <div className="grid gap-5">
                <div className="rounded-md border border-slate-200 bg-white px-4 py-3"><div className="text-base font-semibold text-slate-500">Trip reference</div><div className="mt-1 text-xl font-semibold text-slate-950">{draft.id || nextTripReference(job.trips)}</div></div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DrawerField label="Trip type"><select value={draft.type || ""} onChange={(event) => update("type", event.target.value)} className={drawerInputClass}>{(job.type === "Import" ? ["Import Delivery", "Empty Return"] : ["Empty Collection", "Direct Laden to Port", "One-Way Loaded", "Carpark to Port"]).map((type) => <option key={type}>{type}</option>)}</select></DrawerField>
                  <DrawerField label="Status"><select value={draft.status || "Pending"} onChange={(event) => update("status", event.target.value)} className={drawerInputClass}>{["Pending", "Collected", "In Transit", "Delivered", "Completed", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select></DrawerField>
                </div>
                {(job.type === "Import" && draft.type === "Import Delivery") || (job.type === "Export" && draft.type !== "Empty Return") ? <DrawerField label="Container"><select value={draft.containerRef || draft.containerNumber || ""} onChange={(event) => { const container = jobContainers(job).find((item) => item.ref === event.target.value || item.number === event.target.value); update("containerRef", container?.ref || ""); update("containerNumber", container?.number || ""); }} className={drawerInputClass}>{jobContainers(job).map((container) => <option key={container.ref || container.number} value={container.ref || container.number}>{container.ref ? `${container.ref} · ` : ""}{container.number || "Identity pending"}{container.state ? ` · ${container.state}` : ""}</option>)}</select></DrawerField> : null}
                <DrawerField label="Route"><input required value={draft.route || ""} onChange={(event) => update("route", event.target.value)} className={drawerInputClass} /></DrawerField>
                <DrawerField label="Planned date" hint="Leave blank if the transport desk has not scheduled it."><input type="date" value={draft.plannedDate || ""} onChange={(event) => update("plannedDate", event.target.value)} className={drawerInputClass} /></DrawerField>
                {draft.status === "Cancelled" ? <DrawerField label="Cancellation reason"><textarea required rows={3} value={draft.cancelledReason || ""} onChange={(event) => update("cancelledReason", event.target.value)} className={drawerInputClass} /></DrawerField> : null}
              </div>
            ) : null}

            {panel.type === "chassis" ? (
              <div className="grid gap-5">
                <div className="grid grid-cols-2 gap-4 rounded-md border border-slate-200 bg-white p-5"><div><div className="text-base font-semibold text-slate-500">Unit</div><div className="mt-1 text-3xl font-semibold text-slate-950">{panel.unit}</div></div><div><div className="text-base font-semibold text-slate-500">Size</div><div className="mt-1 text-xl font-semibold text-slate-950">{panel.size}</div></div></div>
                {panel.condition === "available" ? <DrawerField label="Assign to active job"><select required value={draft.jobId || ""} onChange={(event) => update("jobId", event.target.value)} className={drawerInputClass}><option value="">Choose a job</option>{activeJobs.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.customer}</option>)}</select></DrawerField> : null}
                {panel.condition === "assigned" ? <ChoiceGroup label="Chassis action" value={draft.action} onChange={(value) => update("action", value)} options={[{ value: "release", label: "Release to fleet", note: "Make the unit available immediately." }, { value: "keep", label: "Keep assigned", note: "Leave the current assignment unchanged." }]} /> : null}
                {panel.condition === "maintenance" ? <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-[18px] font-medium text-amber-950">This simulates completing the inspection and returning the unit to the available register.</div> : null}
              </div>
            ) : null}

            {panel.type === "freeTime" ? (
              <div className="grid gap-5">
                <DrawerField label="Demurrage last free day"><input required type="date" value={draft.demurrageLastFreeDay || ""} onChange={(event) => update("demurrageLastFreeDay", event.target.value)} className={drawerInputClass} /></DrawerField>
                <DrawerField label="Detention last free day"><input required type="date" value={draft.detentionLastFreeDay || ""} onChange={(event) => update("detentionLastFreeDay", event.target.value)} className={drawerInputClass} /></DrawerField>
              </div>
            ) : null}

            {panel.type === "activity" ? (
              <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {(job?.activity || []).length ? job.activity.map((item) => <div key={item.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-950">{item.text}</span><span className="text-base font-semibold text-slate-500">{item.at}</span></div><div className="mt-2 text-base font-medium text-slate-600">{item.actor}</div></div>) : <div className="p-6 text-center"><History className="mx-auto h-9 w-9 text-slate-400" /><div className="mt-3 text-xl font-semibold text-slate-950">No simulated changes yet</div><div className="mt-2 text-[18px] text-slate-600">Updates made from checkpoints, containers, trips, or chassis will appear here.</div></div>}
              </div>
            ) : null}

            {panel.type === "source" ? (
              <div className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2">
                {Object.entries(job?.sourceDocument?.values || { "Document type": job?.sourceDocument?.documentType, Carrier: job?.sourceDocument?.carrier, "Issue date": job?.sourceDocument?.issueDate, "Bill of lading": job?.billOfLading, "Vessel / voyage": [job?.vessel, job?.voyage].filter(Boolean).join(" / ") }).filter(([, value]) => value).map(([key, value]) => <div key={key} className="min-w-0 bg-white p-4"><div className="text-base font-semibold capitalize text-slate-500">{String(key).replace(/([A-Z])/g, " $1")}</div><div className="mt-2 break-words text-[18px] font-semibold text-slate-950">{String(value)}</div></div>)}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onClose} className="min-h-12 rounded-md border border-slate-300 bg-white px-5 text-[18px] font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{isReadOnly ? "Close" : "Cancel"}</button>
              {canRemoveContainer ? <button type="button" onClick={() => onCommit(panel, { ...draft, _delete: true })} className="inline-flex min-h-12 items-center gap-2 rounded-md border border-rose-300 bg-white px-4 text-[18px] font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600"><Trash2 className="h-5 w-5" />Remove</button> : null}
            </div>
            {!isReadOnly ? <button type="submit" disabled={Boolean(duplicateContainerNumber)} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-[#17418c] px-6 py-3 text-[18px] font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-slate-400"><Save className="h-5 w-5" />{panel.type === "container" && panel.mode === "new" ? "Add container" : "Save and recalculate"}</button> : null}
          </div>
        </form>
      </aside>
    </div>
  );
}

function JobDetail({ job, onBack, onRecordCms, onRecordDetails, onSetTranshipment, onCarparkDecision, onCarparkAvailable, onManage, onNextAction, highlight }) {
  const gate = readiness(job);
  const status = jobStatus(job);
  const isMoment1 = job.id === "EXP-260819-001";
  const isMoment2 = job.id === "EXP-260819-002";
  const isMoment3a = job.id === "EXP-260819-005";
  const isMoment3b = job.id === "EXP-260815-004";
  const chassis = job.chassis || [];
  const containers = jobContainers(job);
  const completedContainers = job.type === "Import"
    ? containers.filter((container) => container.state === "Delivered").length
    : containers.filter((container, index) => ["Completed", "Delivered to Port"].includes(exportContainerStatus(job, container, index))).length;

  return (
    <main id="main-content" className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <button type="button" onClick={onBack} className="inline-flex min-h-12 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-[18px] font-semibold text-[#17418c] hover:bg-slate-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
        <ArrowLeft className="h-6 w-6" /> Back
      </button>

      <header className="mt-5 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">{job.id}</h1>
              <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-base font-semibold text-slate-700">{job.type}</span>
            </div>
            <p className="mt-2 text-xl font-medium text-slate-700">{job.customer}</p>
            <p className="mt-2 flex items-center gap-2 text-[18px] font-normal text-slate-600"><MapPin className="h-5 w-5" /> {location(job)}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <StatusPill status={status} large flash={highlight === "status"} />
            <button type="button" onClick={() => onManage("job")} className="inline-flex min-h-12 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-[18px] font-semibold text-[#17418c] hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600"><PencilLine className="h-5 w-5" />Edit job</button>
            <button type="button" onClick={() => onManage("activity")} className="inline-flex min-h-12 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-[18px] font-semibold text-[#17418c] hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600"><History className="h-5 w-5" />Activity</button>
          </div>
        </div>
      </header>

      {(isMoment1 || isMoment2 || isMoment3a || isMoment3b) ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-5 py-4 text-[18px] font-medium text-sky-900">
          <CircleDot className="mt-0.5 h-5 w-5 shrink-0 text-[#17418c]" />
          <span>
            {isMoment1 ? "Try this: record CMS completed and watch Greenlit create one empty-collection movement per container." : null}
            {isMoment2 ? "Try this: record the missing container details and watch the exception close." : null}
            {isMoment3a ? "Try this: answer transhipment and watch the correct second trip appear under this job." : null}
            {isMoment3b ? "Try this: make transhipment available and watch the third trip appear under this job." : null}
          </span>
        </div>
      ) : null}

      {job.sourceDocument ? (
        <section className={`mt-5 overflow-hidden rounded-lg border border-emerald-200 bg-white ${highlight === "sourceDocument" ? "greenlit-release-flash" : ""}`} aria-labelledby="source-document-title">
          <div className="flex flex-col gap-3 bg-emerald-800 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><FileCheck2 className="h-6 w-6" aria-hidden="true" /><h2 id="source-document-title" className="text-xl font-semibold">Created from a verified arrival notice</h2></div>
            <div className="flex flex-wrap items-center gap-3"><span className="inline-flex min-h-9 items-center rounded-full border border-emerald-500 bg-emerald-900/40 px-3 text-base font-semibold">Processed locally</span><button type="button" onClick={() => onManage("source")} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-emerald-300 bg-white px-4 font-semibold text-emerald-900 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-400">View facts <ChevronRight className="h-5 w-5" /></button></div>
          </div>
          <div className="grid divide-y divide-slate-200 md:grid-cols-2 md:divide-y-0 xl:grid-cols-4">
            <DetailField label="Source document" value={job.sourceDocument.fileName} />
            <DetailField label="Bill of lading" value={job.billOfLading || "Not recorded"} />
            <DetailField label="Vessel / voyage" value={[job.vessel, job.voyage].filter(Boolean).join(" / ") || "Not recorded"} />
            <DetailField label="Fields applied" value={`${job.sourceDocument.extractedCount} verified facts`} />
          </div>
          <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-base font-medium text-amber-950">Free-time dates are planning estimates from ETA until actual discharge and gate events are confirmed.</div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel title="Readiness checkpoint" className={highlight === "readiness" ? "greenlit-release-flash" : ""}>
          <div className="divide-y divide-slate-200">
            {gate.rows.map((row) => (
              <button key={row.label} type="button" onClick={() => onManage("checkpoint", { key: row.key })} className="grid min-h-16 w-full grid-cols-[44px_minmax(0,1fr)_minmax(130px,0.8fr)_24px] items-center gap-3 px-5 py-3 text-left hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-600">
                <span className={`flex h-9 w-9 items-center justify-center rounded-md border ${row.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                  {row.ok ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                </span>
                <span className="text-[18px] font-semibold text-slate-900">{row.label}</span>
                <span className={`font-semibold ${row.ok ? "text-emerald-800" : "text-rose-800"}`}>{row.value}</span>
                <ChevronRight className="h-5 w-5 text-[#17418c]" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className={`flex min-h-24 items-center gap-4 px-5 py-5 text-white ${gate.ready ? "bg-emerald-700" : "bg-rose-700"} ${highlight === "verdict" ? "greenlit-release-flash" : ""}`}>
            {gate.ready ? <CheckCircle2 className="h-8 w-8 shrink-0" /> : <XCircle className="h-8 w-8 shrink-0" />}
            <div>
              <div className="text-xl font-semibold">{gate.ready ? "READY" : "BLOCKED"}</div>
              <div className="mt-1 text-[18px] font-medium">{gate.reason}</div>
            </div>
          </div>
        </Panel>

        <section className="rounded-lg bg-[#172a3a] p-6 text-white" aria-label="Next action">
          <div className="flex items-center gap-3 text-slate-200"><ListTodo className="h-6 w-6" /><h2 className="text-xl font-semibold">Next action</h2></div>
          <p className={`mt-5 text-3xl font-semibold leading-tight tracking-[-0.02em] ${highlight === "nextAction" ? "greenlit-text-flash" : ""}`}>{nextAction(job)}</p>
          <div className="mt-6 border-t border-slate-600 pt-5">
            <div className="font-medium text-slate-300">Why</div>
            <div className="mt-2 text-[18px] font-medium">{blockingReason(job)}</div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="font-medium text-slate-300">Waiting on</span>
            <WaitingPill owner={job.waitingOn} />
          </div>
          <button type="button" onClick={onNextAction} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-md bg-white px-6 py-3 text-[18px] font-semibold text-[#17418c] hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
            {status === "Completed" ? <History className="h-5 w-5" /> : <ListTodo className="h-5 w-5" />}{status === "Completed" ? "View activity" : "Do this now"}<ChevronRight className="h-5 w-5" />
          </button>
        </section>
      </div>

      {isMoment2 ? (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-5 py-5 text-[18px] font-medium leading-relaxed text-rose-900">
          “Without this rule the trip looks finished, the customer never learns the container number, and stuffing never starts.”
        </div>
      ) : null}

      {(isMoment1 && !job.cmsCompleted) ? (
        <section className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-5">
          <h2 className="text-xl font-semibold text-slate-900">Release this checkpoint</h2>
          <p className="mt-2 text-[18px] font-normal text-slate-700">This records the missing internal checkpoint and creates the permitted trip automatically.</p>
          <button type="button" onClick={onRecordCms} className="mt-5 inline-flex min-h-14 items-center gap-3 rounded-md bg-[#17418c] px-6 py-3 text-[18px] font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
            <PackageCheck className="h-6 w-6" /> Record CMS completed
          </button>
        </section>
      ) : null}

      {(isMoment2 && !containers[0]?.number) ? (
        <section className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-xl font-semibold text-rose-900">Open exception: {job.exception.text}</h2>
          <p className="mt-2 text-[18px] font-normal text-rose-900">Delivered 26 hours ago. Container details must be recorded before this trip can complete.</p>
          <button type="button" onClick={onRecordDetails} className="mt-5 inline-flex min-h-14 items-center gap-3 rounded-md bg-[#17418c] px-6 py-3 text-[18px] font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
            <ContainerIcon className="h-6 w-6" /> Record container details
          </button>
        </section>
      ) : null}

      {isMoment3a ? (
        <section className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-5">
          <h2 className="text-xl font-semibold text-slate-900">Set transhipment</h2>
          <p className="mt-2 text-[18px] font-normal text-slate-700">The answer determines whether the laden container goes directly to port or branches through the company carpark.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => onSetTranshipment("available")} aria-pressed={job.transhipment === "available"} className={`min-h-14 rounded-md border px-6 py-3 text-[18px] font-semibold focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${job.transhipment === "available" ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50"}`}>
              Available
            </button>
            <button type="button" onClick={() => onSetTranshipment("not_available")} aria-pressed={job.transhipment === "not_available"} className={`min-h-14 rounded-md border px-6 py-3 text-[18px] font-semibold focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${job.transhipment === "not_available" ? "border-rose-700 bg-rose-700 text-white" : "border-rose-300 bg-white text-rose-800 hover:bg-rose-50"}`}>
              Not available
            </button>
          </div>
          {job.transhipment === "not_available" && job.carparkRequested == null ? (
            <div className="mt-5 rounded-md border border-slate-200 bg-white p-5">
              <div className="text-xl font-semibold text-slate-900">Customer requests carpark?</div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => onCarparkDecision(true)} className="min-h-12 rounded-md bg-[#17418c] px-6 py-2 text-[18px] font-semibold text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Yes — use carpark</button>
                <button type="button" onClick={() => onCarparkDecision(false)} className="min-h-12 rounded-md border border-slate-300 bg-white px-6 py-2 text-[18px] font-semibold text-slate-800 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">No</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {isMoment3b && job.transhipment !== "available" ? (
        <section className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-xl font-semibold text-rose-900">Day 6 at carpark · chassis 4052 held 9 days</h2>
          <p className="mt-2 text-[18px] font-normal text-rose-900">Transhipment is still pending, so the container cannot make its final port trip.</p>
          <button type="button" onClick={onCarparkAvailable} className="mt-5 inline-flex min-h-14 items-center gap-3 rounded-md bg-[#17418c] px-6 py-3 text-[18px] font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
            <Anchor className="h-6 w-6" /> Transhipment now available
          </button>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Containers" action={<button type="button" disabled={containers.length >= MAX_CONTAINERS_PER_JOB} onClick={() => onManage("container", { mode: "new" })} className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold text-[#17418c] underline underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600 disabled:text-slate-400 disabled:no-underline"><Plus className="h-5 w-5" />{containers.length >= MAX_CONTAINERS_PER_JOB ? "20 container limit" : "Add container"}</button>}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-base font-semibold text-slate-700" aria-live="polite"><span>{containers.length} / {MAX_CONTAINERS_PER_JOB} containers on this job</span><span>{completedContainers} complete</span></div>
          <div className="divide-y divide-slate-200">
            {containers.map((container, index) => {
              const containerStatus = job.type === "Import" ? container.state : exportContainerStatus(job, container, index);
              return (
                <button key={container.ref || container.number || index} type="button" onClick={() => onManage("container", { index })} className="grid min-h-24 w-full gap-3 px-5 py-4 text-left hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-600 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span className="min-w-0"><span className="block text-base font-semibold text-slate-500">{container.ref || `C${index + 1}`}</span><span className="mt-1 block break-all text-[18px] font-semibold text-slate-950">{container.number || "Identity pending"}</span><span className="mt-1 block text-base font-medium text-slate-600">{job.type === "Import" ? [container.type, container.seal && `Seal ${container.seal}`].filter(Boolean).join(" · ") || "Type and seal not recorded" : [container.sizeType, container.stuffingLocation].filter(Boolean).join(" · ")}</span></span>
                  <span className="flex items-center justify-between gap-3 sm:justify-end"><span className={`rounded-md border px-3 py-2 font-semibold ${statusTone(containerStatus)}`}>{containerStatus}</span><ChevronRight className="h-5 w-5 text-[#17418c]" /></span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Chassis" action={<button type="button" onClick={() => chassis.length ? onManage("chassis", { unit: chassis[0].unit, size: chassis[0].size, condition: "assigned" }) : onManage("fleet")} className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold text-[#17418c] underline underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600"><Truck className="h-5 w-5" />{chassis.length ? "Manage chassis" : "Assign chassis"}</button>}>
          {chassis.length ? (
            <div className="divide-y divide-slate-200">
              {chassis.map((item) => (
                <button key={item.unit} type="button" onClick={() => onManage("chassis", { unit: item.unit, size: item.size, condition: "assigned" })} className="grid min-h-24 w-full grid-cols-[1fr_1fr_1fr_24px] items-center gap-4 px-5 py-4 text-left hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-600">
                  <div><div className="font-semibold text-slate-700">Unit</div><div className="mt-1 text-2xl font-black text-slate-950">{item.unit}</div></div>
                  <div><div className="font-semibold text-slate-700">Size</div><div className="mt-1 text-[18px] font-extrabold text-slate-950">{item.size}</div></div>
                  <div><div className="font-semibold text-slate-700">Held</div><div className={`mt-1 text-[18px] font-extrabold ${daysHeld(item.heldSince) > 5 ? "text-red-900" : "text-slate-950"}`}>{item.released ? "Released" : `${daysHeld(item.heldSince)} days`}</div></div>
                  <ChevronRight className="h-5 w-5 text-[#17418c]" />
                </button>
              ))}
            </div>
          ) : <div className="px-5 py-8 text-[18px] font-semibold text-slate-700">No chassis assigned yet.</div>}
        </Panel>
      </div>

      {job.type === "Import" ? (
        <Panel title="Free time" className="mt-7" action={<button type="button" onClick={() => onManage("freeTime")} className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold text-[#17418c] underline underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600"><CalendarDays className="h-5 w-5" />Confirm dates</button>}>
          <div className="grid md:grid-cols-2">
            {[
              { label: "Demurrage", date: job.demurrageLastFreeDay },
              { label: "Detention", date: job.detentionLastFreeDay },
            ].map((clock, index) => {
              const days = daysUntil(clock.date);
              return (
                <div key={clock.label} className={`flex min-h-36 items-center justify-between gap-5 p-6 ${index === 0 ? "border-b border-slate-200 md:border-b-0 md:border-r" : ""}`}>
                  <div><div className="text-xl font-extrabold text-slate-950">{clock.label}</div><div className="mt-2 font-semibold text-slate-700">Last free day: {new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "long", year: "numeric" }).format(parseDay(clock.date))}</div></div>
                  <span className={`inline-flex min-h-14 items-center rounded-md border px-4 py-2 text-[18px] font-semibold ${freeTimeTone(days)}`}>{freeTimeLabel(days)}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <Panel title={`Trip history · ${job.trips.length} trip${job.trips.length === 1 ? "" : "s"} under ${job.id}`} className="mt-7" action={<button type="button" onClick={() => onManage("trip")} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#17418c] px-4 font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600"><Plus className="h-5 w-5" />Add trip</button>}>
        <TripTable trips={job.trips} flashTripId={highlight?.startsWith("trip:") ? highlight.split(":")[1] : ""} onOpenTrip={(tripId) => onManage("trip", { tripId })} />
      </Panel>

      {(job.activity || []).length ? (
        <Panel title="Recent activity" className="mt-7" action={<button type="button" onClick={() => onManage("activity")} className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold text-[#17418c] underline underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600"><History className="h-5 w-5" />View full history</button>}>
          <div className="divide-y divide-slate-200">
            {job.activity.slice(0, 3).map((item) => <div key={item.id} className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="font-semibold text-slate-950">{item.text}</div><div className="text-base font-semibold text-slate-500">{item.at} · {item.actor}</div></div>)}
          </div>
        </Panel>
      ) : null}

      <div className="mt-7 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-[18px] font-medium text-slate-700">
        One job number keeps every trip, container fact, checkpoint and chassis decision together: <span className="font-semibold text-[#17418c]">{job.id}</span>.
      </div>
    </main>
  );
}

function buildFleet(jobs, clearedMaintenanceUnits = []) {
  const inUse = jobs.flatMap((job) => (job.chassis || []).filter((item) => !item.released).map((item) => ({ ...item, jobId: job.id, customer: job.customer, days: daysHeld(item.heldSince) })));
  const inUseUnits = new Set(inUse.map((item) => item.unit));
  const cleared = new Set(clearedMaintenanceUnits);
  const maintenanceUnits = new Set([...MAINTENANCE_UNITS["20ft"], ...MAINTENANCE_UNITS["40ft"]].filter((unit) => !cleared.has(unit)));
  const all20 = Array.from({ length: 47 }, (_, index) => ({ unit: 2038 + index, size: "20ft" }));
  const all40 = [...Array.from({ length: 41 }, (_, index) => ({ unit: 4029 + index, size: "40ft" })), { unit: 4488, size: "40ft" }];
  const available = [...all20, ...all40].filter((item) => !inUseUnits.has(item.unit) && !maintenanceUnits.has(item.unit));
  const maintenance = [...all20, ...all40].filter((item) => maintenanceUnits.has(item.unit));
  return { inUse, available, maintenance };
}

function documentConfidenceTone(level) {
  if (level === "high") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (level === "edited") return "border-sky-200 bg-sky-50 text-sky-800";
  if (level === "review") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function DocumentField({ field, value, confidence, onChange }) {
  const status = confidence === "high" ? "Extracted" : confidence === "edited" ? "Edited" : confidence === "review" ? "Review" : "Missing";
  return (
    <label className={`block px-5 py-4 ${field.multiline ? "md:col-span-2" : ""}`}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-semibold text-slate-700">{field.label}{field.required ? " *" : ""}</span>
        <span className={`inline-flex min-h-7 items-center rounded-full border px-2 text-sm font-semibold ${documentConfidenceTone(confidence)}`}>{status}</span>
      </span>
      {field.multiline ? (
        <textarea
          required={field.required}
          value={value || ""}
          onChange={(event) => onChange(field.key, event.target.value)}
          rows={3}
          className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[18px] font-medium text-slate-950 outline-none placeholder:text-slate-500 focus:border-[#17418c] focus:outline focus:outline-4 focus:outline-offset-1 focus:outline-sky-600"
        />
      ) : (
        <input
          required={field.required}
          type={field.type || "text"}
          inputMode={field.inputMode}
          value={value || ""}
          onChange={(event) => onChange(field.key, event.target.value)}
          className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[18px] font-medium text-slate-950 outline-none placeholder:text-slate-500 focus:border-[#17418c] focus:outline focus:outline-4 focus:outline-offset-1 focus:outline-sky-600"
        />
      )}
    </label>
  );
}

function normaliseDocumentContainers(containers) {
  return containers.map((container, index) => ({
    ...container,
    ref: `C${index + 1}`,
    number: String(container.number || "").toUpperCase().replace(/\s+/g, ""),
    type: String(container.type || "").trim(),
    seal: String(container.seal || "").trim().toUpperCase(),
  }));
}

function documentContainerIssues(containers) {
  const normalised = normaliseDocumentContainers(containers);
  return normalised.map((container, index) => {
    if (!container.number) return "Enter a container number.";
    if (!/^[A-Z]{4}[0-9]{7}$/.test(container.number)) return "Use four letters followed by seven digits.";
    if (normalised.some((other, otherIndex) => otherIndex !== index && other.number === container.number)) return "This container number appears more than once.";
    return "";
  });
}

function DocumentContainersEditor({ containers, onChange }) {
  const issues = documentContainerIssues(containers);
  const update = (index, key, value) => onChange(containers.map((container, containerIndex) => containerIndex === index ? { ...container, [key]: value } : container));
  const add = () => {
    if (containers.length >= MAX_CONTAINERS_PER_JOB) return;
    onChange([...containers, { id: `manual-container-${Date.now()}`, ref: `C${containers.length + 1}`, number: "", type: "", seal: "" }]);
  };
  const remove = (index) => {
    if (containers.length <= 1) return;
    onChange(containers.filter((_, containerIndex) => containerIndex !== index).map((container, containerIndex) => ({ ...container, ref: `C${containerIndex + 1}` })));
  };

  return (
    <fieldset>
      <legend className="w-full bg-slate-100 px-5 py-3 text-[18px] font-semibold text-slate-950">Containers</legend>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div><div className="text-[18px] font-semibold text-slate-950">{containers.length} container{containers.length === 1 ? "" : "s"} found</div><div className="mt-1 text-base font-medium text-slate-600">Review each unit independently. A job can contain up to {MAX_CONTAINERS_PER_JOB}.</div></div>
        <button type="button" onClick={add} disabled={containers.length >= MAX_CONTAINERS_PER_JOB} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 font-semibold text-[#17418c] hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:border-sky-200 disabled:bg-sky-50 disabled:text-sky-800"><Plus className="h-5 w-5" />{containers.length >= MAX_CONTAINERS_PER_JOB ? "Limit reached" : "Add container"}</button>
      </div>
      <div className="divide-y divide-slate-200">
        {containers.map((container, index) => (
          <div key={container.id || `${container.ref}-${index}`} className="px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3"><span className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-slate-100 px-3 font-semibold text-slate-800">C{index + 1}</span><span className="text-base font-semibold text-slate-600">{container.id?.startsWith("manual-") ? "Added for review" : "Extracted from PDF"}</span></div>
              <button type="button" onClick={() => remove(index)} disabled={containers.length <= 1} className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold text-rose-800 underline underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600 disabled:text-slate-400 disabled:no-underline"><Trash2 className="h-5 w-5" />Remove</button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label><span className="text-base font-semibold text-slate-700">Container number *</span><input required maxLength={11} pattern="[A-Za-z]{4}[0-9]{7}" value={container.number || ""} onChange={(event) => update(index, "number", event.target.value)} className={drawerInputClass} /></label>
              <label><span className="text-base font-semibold text-slate-700">Container type</span><input value={container.type || ""} onChange={(event) => update(index, "type", event.target.value)} className={drawerInputClass} /></label>
              <label><span className="text-base font-semibold text-slate-700">Seal number</span><input value={container.seal || ""} onChange={(event) => update(index, "seal", event.target.value)} className={drawerInputClass} /></label>
            </div>
            {issues[index] ? <div role="alert" className="mt-3 text-base font-semibold text-rose-800">{issues[index]}</div> : null}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function DocumentIntake({ documents, onApply, onOpenJob }) {
  const [stage, setStage] = useState("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [draft, setDraft] = useState({});
  const [confidence, setConfidence] = useState({});
  const [containerDrafts, setContainerDrafts] = useState([]);
  const [error, setError] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  async function acceptFile(file) {
    setError("");
    setProgress("Preparing the document");
    setStage("processing");
    let nextUrl = "";
    try {
      nextUrl = URL.createObjectURL(file);
      const extracted = await readPdfText(file, { onProgress: setProgress });
      setProgress("Matching Hapag-Lloyd fields");
      const parsed = parseArrivalNoticeText(extracted.text);
      setResult({
        ...parsed,
        fileName: file.name,
        fileSize: file.size,
        pages: extracted.pages,
      });
      setDraft(parsed.values);
      setConfidence(parsed.confidence);
      setContainerDrafts(parsed.containers.length ? parsed.containers : [{ id: "container-1", ref: "C1", number: "", type: "", seal: "" }]);
      setSourceUrl(nextUrl);
      setStage("review");
    } catch (problem) {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      setError(problem instanceof Error ? problem.message : "Greenlit could not read this PDF. Choose another arrival notice.");
      setProgress("");
      setStage("error");
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  }

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setConfidence((current) => ({ ...current, [key]: "edited" }));
  }

  function resetIntake() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl("");
    setStage("idle");
    setResult(null);
    setDraft({});
    setConfidence({});
    setContainerDrafts([]);
    setError("");
    setProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const normalisedContainers = normaliseDocumentContainers(containerDrafts);
  const containerIssues = documentContainerIssues(containerDrafts);
  const effectiveDraft = { ...draft, containerNumber: normalisedContainers[0]?.number || "", containerType: normalisedContainers[0]?.type || "", sealNumber: normalisedContainers[0]?.seal || "" };
  const requiredMissing = REQUIRED_JOB_FIELDS.filter((key) => !String(effectiveDraft[key] || "").trim());
  const planningDemurrage = addIsoDays(draft.eta, Number(draft.demurrageFreeDays || 3));
  const planningDetention = addIsoDays(draft.eta, Number(draft.demurrageFreeDays || 3) + Number(draft.detentionFreeDays || 4));
  const reviewCount = Object.values(confidence).filter((level) => level === "review").length;

  return (
    <main id="main-content" className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">Document intake</h1>
          <p className="mt-2 max-w-[72ch] text-[18px] font-normal text-slate-600">Turn an arrival notice into verified job facts before anything enters the control tower.</p>
        </div>
        <div className="inline-flex min-h-11 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 text-base font-semibold text-emerald-800">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          Processed on this device
        </div>
      </div>

      {stage === "processing" ? (
        <section className="mt-7 flex min-h-80 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-12 text-center" aria-live="polite">
          <LoaderCircle className="h-12 w-12 animate-spin text-[#17418c]" aria-hidden="true" />
          <h2 className="mt-5 text-2xl font-semibold text-slate-950">Reading the arrival notice</h2>
          <p className="mt-2 text-[18px] font-semibold text-[#17418c]">{progress || "Preparing the document"}</p>
          <p className="mt-2 max-w-[58ch] text-[18px] text-slate-600">Greenlit is finding shipment, party, container, cargo and free-time facts. The file remains in this browser.</p>
        </section>
      ) : null}

      {(stage === "idle" || stage === "error") ? (
        <section className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="upload-document-title">
          <div className="border-b border-slate-200 bg-[#172a3a] px-5 py-4 text-white">
            <h2 id="upload-document-title" className="text-xl font-semibold">Upload an arrival notice</h2>
          </div>
          <div className="p-5 sm:p-8">
            {error ? (
              <div role="alert" className="mb-5 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-[18px] font-medium text-rose-900">
                <AlertCircle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
                <div><div className="font-semibold">The PDF was not applied.</div><div className="mt-1">{error}</div></div>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) acceptFile(file);
                event.target.value = "";
              }}
            />
            <div
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex min-h-72 flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center ${dragging ? "border-[#17418c] bg-sky-50" : "border-slate-300 bg-slate-50"}`}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-md bg-[#17418c] text-white"><Upload className="h-7 w-7" aria-hidden="true" /></span>
              <span className="mt-5 text-2xl font-semibold text-slate-950">Drop a PDF here</span>
              <span className="mt-2 max-w-[58ch] text-[18px] font-normal text-slate-600">This proof of concept recognises Hapag-Lloyd-style arrival notices with selectable text and up to {MAX_CONTAINERS_PER_JOB} containers per job. Maximum file size: 15 MB.</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 inline-flex min-h-12 items-center justify-center rounded-md bg-[#17418c] px-6 text-[18px] font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              >
                Choose PDF
              </button>
            </div>
            <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 md:grid-cols-3">
              {[
                { icon: ScanText, title: "Extract", text: "Read labelled shipment facts from every page." },
                { icon: FileCheck2, title: "Verify", text: "Review uncertain fields before they enter a job." },
                { icon: ListTodo, title: "Apply", text: "Create the job and recalculate the action queue." },
              ].map((item) => {
                const Icon = item.icon;
                return <div key={item.title} className="flex gap-3"><Icon className="mt-0.5 h-6 w-6 shrink-0 text-[#17418c]" aria-hidden="true" /><div><div className="font-semibold text-slate-950">{item.title}</div><div className="mt-1 text-base font-normal text-slate-600">{item.text}</div></div></div>;
              })}
            </div>
          </div>
        </section>
      ) : null}

      {stage === "review" && result ? (
        <div className="mt-7">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="document-review-title">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-[#172a3a] px-5 py-5 text-white lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 id="document-review-title" className="flex items-center gap-3 text-xl font-semibold"><FileText className="h-6 w-6" aria-hidden="true" />Review extracted facts</h2>
                <p className="mt-2 break-all text-base font-medium text-slate-300">{result.fileName} · {result.pages} pages · {(result.fileSize / 1024).toFixed(0)} KB</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex min-h-9 items-center rounded-full border border-emerald-500/50 bg-emerald-950/40 px-3 text-base font-semibold text-emerald-100">{result.extractedCount} fields extracted</span>
                <span className="inline-flex min-h-9 items-center rounded-full border border-sky-400/50 bg-sky-950/40 px-3 text-base font-semibold text-sky-100">{containerDrafts.length} container{containerDrafts.length === 1 ? "" : "s"}</span>
                <span className="inline-flex min-h-9 items-center rounded-full border border-amber-400/60 bg-amber-950/30 px-3 text-base font-semibold text-amber-100">{reviewCount} need review</span>
              </div>
            </div>

            <div className="grid xl:grid-cols-[0.82fr_1.18fr]">
              <div className="border-b border-slate-200 bg-slate-100 p-4 xl:border-b-0 xl:border-r">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-800">Source PDF</div>
                  <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-2 font-semibold text-[#17418c] underline underline-offset-4">Open separately</a>
                </div>
                <object data={sourceUrl} type="application/pdf" className="h-[680px] w-full rounded-md border border-slate-300 bg-white" aria-label={`Source PDF ${result.fileName}`}>
                  <div className="p-5 text-[18px] text-slate-700">Your browser cannot show the PDF inline. Use “Open separately” while reviewing the extracted fields.</div>
                </object>
              </div>

              <form onSubmit={(event) => { event.preventDefault(); onApply({ ...result, values: effectiveDraft, containers: normalisedContainers, confidence, planning: { demurrageLastFreeDay: planningDemurrage, detentionLastFreeDay: planningDetention, provisional: true } }); }}>
                <div className="flex items-start gap-3 border-b border-sky-200 bg-sky-50 px-5 py-4 text-[18px] font-medium text-sky-900">
                  <CircleDot className="mt-0.5 h-5 w-5 shrink-0 text-[#17418c]" aria-hidden="true" />
                  <span>Check fields marked <strong>Review</strong>. Greenlit will never overwrite a job until an operator applies the document.</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {DOCUMENT_FIELD_GROUPS.map((group) => (
                    <React.Fragment key={group.title}>
                      <fieldset>
                        <legend className="w-full bg-slate-100 px-5 py-3 text-[18px] font-semibold text-slate-950">{group.title}</legend>
                        <div className="grid divide-y divide-slate-200 md:grid-cols-2 md:divide-y-0">
                          {group.fields.map((field) => <DocumentField key={field.key} field={field} value={draft[field.key]} confidence={confidence[field.key]} onChange={updateField} />)}
                        </div>
                      </fieldset>
                      {group.title === "Shipment" ? <DocumentContainersEditor containers={containerDrafts} onChange={setContainerDrafts} /> : null}
                    </React.Fragment>
                  ))}
                </div>

                <div className="border-t border-amber-200 bg-amber-50 px-5 py-4 text-[18px] text-amber-950">
                  <div className="font-semibold">Planning dates require confirmation</div>
                  <div className="mt-1 font-medium">Greenlit estimates demurrage to {planningDemurrage || "—"} and detention to {planningDetention || "—"} from ETA and the stated free-time terms. Operations must replace them after actual discharge and gate events.</div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={resetIntake} className="min-h-12 rounded-md border border-slate-300 bg-white px-5 text-[18px] font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Choose another PDF</button>
                  <div className="text-right">
                    {requiredMissing.length ? <div className="mb-2 text-base font-semibold text-rose-800">Complete {requiredMissing.length} required field{requiredMissing.length === 1 ? "" : "s"} before applying.</div> : null}
                    {containerIssues.some(Boolean) ? <div className="mb-2 text-base font-semibold text-rose-800">Correct the container list before applying.</div> : null}
                    <button type="submit" disabled={requiredMissing.length > 0 || containerIssues.some(Boolean)} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-[#17418c] px-6 py-3 text-[18px] font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-slate-400">
                      <FileCheck2 className="h-6 w-6" aria-hidden="true" />Apply to control tower
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {documents.length ? (
        <section className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="processed-documents-title">
          <div className="border-b border-slate-200 px-5 py-4"><h2 id="processed-documents-title" className="text-xl font-semibold text-slate-950">Processed this session</h2></div>
          <div className="divide-y divide-slate-200">
            {documents.map((document) => (
              <button key={document.id} type="button" onClick={() => onOpenJob(document.jobId)} className="grid min-h-20 w-full gap-2 px-5 py-4 text-left hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-600 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div><div className="break-all text-[18px] font-semibold text-[#17418c] underline underline-offset-4">{document.fileName}</div><div className="mt-1 text-base font-medium text-slate-600">{document.carrier} · {document.documentType} · {document.containerCount || 1} container{document.containerCount === 1 ? "" : "s"} · {document.extractedCount} fields</div></div>
                <div className="font-semibold text-slate-900">Applied to {document.jobId}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ChassisFleet({ fleet, onOpen, onUnit }) {
  const [view, setView] = useState("all");
  const showInUse = view === "all" || view === "inUse";
  const showAvailable = view === "all" || view === "available";
  const showMaintenance = view === "all" || view === "maintenance";
  return (
    <main id="main-content" className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="pb-2">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">Chassis Fleet</h1>
        <p className="mt-2 text-[18px] font-normal text-slate-600">89 units · 47 twenty-foot · 42 forty-foot. A chassis stays under its container for the whole job.</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[{ id: "available", label: "Available", value: fleet.available.length, tone: "text-emerald-800" }, { id: "inUse", label: "Under containers", value: fleet.inUse.length, tone: "text-slate-950" }, { id: "maintenance", label: "Maintenance or inspection", value: fleet.maintenance.length, tone: "text-amber-800" }].map((item) => <button key={item.id} type="button" onClick={() => setView((current) => current === item.id ? "all" : item.id)} aria-pressed={view === item.id} className={`rounded-lg border bg-white p-5 text-left hover:border-[#17418c] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${view === item.id ? "border-[#17418c] shadow-[inset_0_-3px_0_#17418c]" : "border-slate-200"}`}><div className={`text-4xl font-semibold tabular-nums ${item.tone}`}>{item.value}</div><div className="mt-2 flex items-center justify-between gap-3 text-[18px] font-medium text-slate-600"><span>{item.label}</span><ChevronRight className="h-5 w-5 text-[#17418c]" /></div></button>)}
      </div>

      {showInUse ? <Panel title="Units under containers" className="mt-7">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left text-[18px]">
            <thead className="bg-[#172a3a] text-white"><tr>{["Unit", "Size", "Job", "Customer", "Days held", ""].map((heading, index) => <th key={`${heading}-${index}`} className="px-4 py-4 text-base font-semibold">{heading}</th>)}</tr></thead>
            <tbody>
              {[...fleet.inUse].sort((a, b) => b.days - a.days).map((item) => (
                <tr key={item.unit} className="border-b border-slate-200 even:bg-slate-50/70">
                  <td className="px-4 py-4"><button type="button" onClick={() => onUnit({ ...item, condition: "assigned" })} className="min-h-11 text-xl font-semibold text-[#17418c] underline underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600">{item.unit}</button></td>
                  <td className="px-4 py-4 font-semibold text-slate-900">{item.size}</td>
                  <td className="px-4 py-4 font-semibold text-[#17418c]">{item.jobId}</td>
                  <td className="px-4 py-4 font-semibold text-slate-900">{item.customer}</td>
                  <td className={`px-4 py-4 text-[18px] font-extrabold ${item.days > 5 ? "text-red-900" : "text-slate-950"}`}>{item.days} days {item.days > 5 ? "— ATTENTION" : ""}</td>
                  <td className="px-4 py-4"><button type="button" onClick={() => onOpen(item.jobId)} className="min-h-11 rounded-md border border-slate-300 px-4 font-semibold text-[#17418c] hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600">Open job</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel> : null}

      {showAvailable ? <div className="mt-7 grid gap-7 xl:grid-cols-2">
        <Panel title="20ft available">
          <div className="flex flex-wrap gap-3 p-5">{fleet.available.filter((item) => item.size === "20ft").map((item) => <button key={item.unit} type="button" onClick={() => onUnit({ ...item, condition: "available" })} className="inline-flex min-h-11 min-w-20 items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 font-semibold text-[#17418c] hover:border-[#17418c] hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{item.unit}<Plus className="h-4 w-4" /></button>)}</div>
        </Panel>
        <Panel title="40ft available">
          <div className="flex flex-wrap gap-3 p-5">{fleet.available.filter((item) => item.size === "40ft").map((item) => <button key={item.unit} type="button" onClick={() => onUnit({ ...item, condition: "available" })} className="inline-flex min-h-11 min-w-20 items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 font-semibold text-[#17418c] hover:border-[#17418c] hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{item.unit}<Plus className="h-4 w-4" /></button>)}</div>
        </Panel>
      </div> : null}

      {showMaintenance ? <Panel title="Maintenance or inspection" className="mt-7">
        <div className="flex flex-wrap gap-3 p-5">{fleet.maintenance.length ? fleet.maintenance.map((item) => <button type="button" onClick={() => onUnit({ ...item, condition: "maintenance" })} key={item.unit} className="inline-flex min-h-11 min-w-28 items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 font-semibold text-amber-800 hover:border-amber-500 hover:bg-amber-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600"><Wrench className="h-5 w-5" />{item.unit} · {item.size}<ChevronRight className="h-4 w-4" /></button>) : <div className="p-5 text-[18px] font-semibold text-amber-950">All maintenance units have returned to service.</div>}</div>
      </Panel> : null}
    </main>
  );
}

function nextDocumentJobId(jobs) {
  const prefix = `JOB-${DEMO_TODAY.slice(2).replaceAll("-", "")}-`;
  const nextNumber = jobs.reduce((highest, job) => {
    if (!job.id.startsWith(prefix)) return highest;
    return Math.max(highest, Number(job.id.slice(prefix.length)) || 0);
  }, 0) + 1;
  return `${prefix}${String(nextNumber).padStart(3, "0")}`;
}

function partyName(value) {
  return String(value || "").split("·")[0].trim() || "Consignee to confirm";
}

function buildImportJobFromDocument(result, jobs, existingJob = null) {
  const fields = result.values;
  const jobId = existingJob?.id || nextDocumentJobId(jobs);
  const incoming = (result.containers?.length ? result.containers : [{ number: fields.containerNumber, type: fields.containerType, seal: fields.sealNumber }]).slice(0, MAX_CONTAINERS_PER_JOB);
  const mappedContainers = incoming.map((item, index) => {
    const previous = existingJob?.containers?.find((container) => container.number === item.number) || existingJob?.containers?.[index];
    return {
      ...previous,
      ref: item.ref || previous?.ref || `C${index + 1}`,
      number: item.number,
      type: item.type || previous?.type || "",
      seal: item.seal || previous?.seal || "",
      state: previous?.state || "Awaiting permit",
      lastFreeDay: previous?.lastFreeDay || result.planning.demurrageLastFreeDay,
      cargoDescription: item.cargoDescription || fields.cargoDescription || "",
      grossWeightKg: item.grossWeightKg || "",
    };
  });
  const incomingNumbers = new Set(mappedContainers.map((container) => container.number));
  const retainedContainers = (existingJob?.containers || []).filter((container) => !incomingNumbers.has(container.number));
  const containers = [...mappedContainers, ...retainedContainers].slice(0, MAX_CONTAINERS_PER_JOB);
  return {
    ...(existingJob || {}),
    id: jobId,
    type: "Import",
    customer: partyName(fields.consignee),
    createdDate: existingJob?.createdDate || DEMO_TODAY,
    infoComplete: REQUIRED_JOB_FIELDS.every((key) => Boolean(String(fields[key] || "").trim())),
    permitReceived: existingJob?.permitReceived || false,
    portnetReleased: existingJob?.portnetReleased || false,
    terminal: fields.terminal,
    deliveryAddress: fields.deliveryAddress || fields.consignee,
    containers,
    trips: existingJob?.trips || [],
    chassis: existingJob?.chassis || [],
    demurrageLastFreeDay: result.planning.demurrageLastFreeDay,
    detentionLastFreeDay: result.planning.detentionLastFreeDay,
    deadlineProvisional: true,
    booking: fields.bookingNumber,
    billOfLading: fields.billOfLading,
    vessel: fields.vessel,
    voyage: fields.voyage,
    portOfLoading: fields.portOfLoading,
    portOfDischarge: fields.portOfDischarge,
    sealNumber: fields.sealNumber,
    containerType: fields.containerType,
    cargoDescription: fields.cargoDescription,
    sourceDocument: {
      fileName: result.fileName,
      documentType: fields.documentType,
      carrier: fields.carrier,
      pages: result.pages,
      issueDate: fields.issueDate,
      extractedCount: result.extractedCount,
      containerCount: containers.length,
      processedLocally: true,
      values: { ...fields },
      containers: containers.map((container) => ({ ref: container.ref, number: container.number, type: container.type, seal: container.seal })),
    },
    exception: existingJob?.exception || null,
  };
}

export default function GreenlitControlTower() {
  const [jobs, setJobs] = useState(cloneSeedJobs);
  const [documents, setDocuments] = useState([]);
  const [clearedMaintenanceUnits, setClearedMaintenanceUnits] = useState([]);
  const [workPanel, setWorkPanel] = useState(null);
  const [screen, setScreen] = useState("dashboard");
  const [returnScreen, setReturnScreen] = useState("actions");
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [actionFilter, setActionFilter] = useState("all");
  const [dashboardFilter, setDashboardFilter] = useState(null);
  const [toast, setToast] = useState("");
  const [highlight, setHighlight] = useState("");
  const [toastTimer, setToastTimer] = useState(null);
  const [highlightTimer, setHighlightTimer] = useState(null);

  const actionJobs = jobs.filter(isActionRequired).sort((a, b) => urgency(b) - urgency(a));
  const fleet = buildFleet(jobs, clearedMaintenanceUnits);
  const selectedJob = jobs.find((job) => job.id === selectedJobId);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(toastTimer);
    setToastTimer(window.setTimeout(() => setToast(""), 5200));
  }

  function flashSequence(sequence) {
    window.clearTimeout(highlightTimer);
    sequence.forEach(({ value, delay }) => window.setTimeout(() => setHighlight(value), delay));
    setHighlightTimer(window.setTimeout(() => setHighlight(""), Math.max(...sequence.map((item) => item.delay)) + 1300));
  }

  function openJob(id) {
    setReturnScreen(screen === "detail" ? "actions" : screen);
    setSelectedJobId(id);
    setScreen("detail");
    setHighlight("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goTo(nextScreen) {
    setScreen(nextScreen);
    setSelectedJobId(null);
    setHighlight("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showActions(filter = "all") {
    const standard = ["us", "customer", "carrier"].includes(filter) ? filter : "all";
    setActionFilter(standard);
    setDashboardFilter(["active", "blocked", "exceptions", "carpark", "freeTime"].includes(filter) ? filter : null);
    goTo("actions");
  }

  function updateJob(id, updater) {
    setJobs((current) => current.map((job) => job.id === id ? updater(job) : job));
  }

  function manageJob(jobId, type, details = {}) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    if (type === "fleet") {
      goTo("fleet");
      return;
    }
    if (type === "checkpoint") {
      if (details.key === "infoComplete") type = "job";
      if (["containerDetails", "containerNumber", "detailsSent", "customerReady", "vgm"].includes(details.key)) {
        type = "container";
        const containers = jobContainers(job);
        const index = containers.findIndex((container) => {
          if (["containerDetails", "containerNumber"].includes(details.key)) return !(container.number && (job.type === "Import" || (container.seal && container.tareKg)));
          if (details.key === "detailsSent") return !container.detailsSent;
          if (details.key === "customerReady") return !container.customerReady;
          return !container.vgmKg || Number(container.vgmKg) <= Number(container.tareKg || 0);
        });
        details = { index: Math.max(0, index) };
      }
      if (details.key === "emptyDelivered") {
        type = "trip";
        details = { tripId: job.trips.find((trip) => trip.type === "Empty Collection")?.id };
      }
    }
    setWorkPanel({ type, jobId, ...details });
  }

  function manageNextAction(jobId) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    const status = jobStatus(job);
    const exportTargetIndex = job.type === "Export" ? Math.max(0, jobContainers(job).findIndex((container, index) => exportContainerStatus(job, container, index) === status)) : 0;
    if (status === "Completed") return manageJob(jobId, "activity");
    if (status === "Incomplete") return manageJob(jobId, "job");
    if (status === "Awaiting CMS") return manageJob(jobId, "checkpoint", { key: "cmsCompleted" });
    if (["Empty Delivered", "Awaiting VGM", "Awaiting Container Details Notification", "Awaiting Customer Stuffing"].includes(status)) return manageJob(jobId, "container", { index: exportTargetIndex });
    if (status === "Awaiting T/T") return manageJob(jobId, "checkpoint", { key: "transhipment" });
    if (["Carpark Decision Needed", "Delivery Path Needed"].includes(status)) return manageJob(jobId, "checkpoint", { key: "deliveryPath" });
    if (status === "Awaiting Permit") return manageJob(jobId, "checkpoint", { key: "permitReceived" });
    if (status === "Awaiting Portnet") return manageJob(jobId, "checkpoint", { key: "portnetReleased" });
    if (["Partially Delivered", "Partially Collected"].includes(status)) return manageJob(jobId, "container", { index: job.type === "Import" ? Math.max(0, job.containers.findIndex((container) => container.state !== "Delivered")) : Math.max(0, jobContainers(job).findIndex((container, index) => !["Completed", "Delivered to Port"].includes(exportContainerStatus(job, container, index)))) });
    if (["Empty Collected", "Empty Collection Scheduled", "Transport Assigned"].includes(status)) {
      const trip = [...job.trips].reverse().find((item) => item.status !== "Completed" && item.status !== "Cancelled");
      return manageJob(jobId, "trip", { tripId: trip?.id });
    }
    if (status === "Empty Return Pending") {
      const trip = [...job.trips].reverse().find((item) => item.type === "Empty Return" && item.status !== "Completed" && item.status !== "Cancelled");
      return manageJob(jobId, "trip", { tripId: trip?.id });
    }
    if (status === "Delivered to Port" && (job.chassis || []).some((item) => !item.released)) {
      const chassis = job.chassis.find((item) => !item.released);
      return manageJob(jobId, "chassis", { unit: chassis.unit, size: chassis.size, condition: "assigned" });
    }
    if (status === "Delivered to Port") {
      const trip = [...job.trips].reverse().find((item) => ["Direct Laden to Port", "Carpark to Port"].includes(item.type));
      return manageJob(jobId, "trip", { tripId: trip?.id });
    }
    return manageJob(jobId, "trip");
  }

  function commitOperationalPanel(panel, draft) {
    if (panel.type === "chassis" && panel.condition === "maintenance") {
      setClearedMaintenanceUnits((current) => current.includes(panel.unit) ? current : [...current, panel.unit]);
      setWorkPanel(null);
      showToast(`Chassis ${panel.unit} passed inspection and returned to the available fleet.`);
      return;
    }

    const targetJobId = panel.type === "chassis" && panel.condition === "available" ? draft.jobId : panel.jobId;
    if (!targetJobId) return;
    if (panel.type === "container") {
      const targetJob = jobs.find((job) => job.id === targetJobId);
      if (!targetJob) return;
      try {
        const nextJob = draft._delete
          ? removeContainerRecord(targetJob, panel.index || 0)
          : panel.mode === "new"
            ? addContainerRecord(targetJob, draft)
            : applyContainerUpdate(targetJob, panel.index || 0, draft);
        setJobs((current) => current.map((job) => job.id === targetJobId ? nextJob : job));
        setWorkPanel(null);
        setHighlight("container");
        window.setTimeout(() => setHighlight(""), 1400);
        showToast(draft._delete ? "Container removed. Job progress recalculated." : panel.mode === "new" ? `Container added. ${jobContainers(nextJob).length} of ${MAX_CONTAINERS_PER_JOB} slots are in use.` : "Container updated. Linked movement and readiness state recalculated.");
      } catch (problem) {
        showToast(problem instanceof Error ? problem.message : "Greenlit could not update this container.");
      }
      return;
    }
    let activityMessage = "Job updated. Status and next action recalculated.";
    let nextHighlight = "status";
    updateJob(targetJobId, (job) => {
      if (panel.type === "job") {
        activityMessage = "Job information saved. Readiness recalculated.";
        nextHighlight = "readiness";
        return applyJobFacts(job, draft);
      }
      if (panel.type === "checkpoint") {
        activityMessage = "Checkpoint saved. The action queue was recalculated.";
        nextHighlight = "readiness";
        return applyCheckpoint(job, panel.key, draft.value);
      }
      if (panel.type === "trip") {
        activityMessage = panel.tripId ? `${panel.tripId} updated. Job progress recalculated.` : "New trip created under the same job.";
        nextHighlight = `trip:${panel.tripId || nextTripReference(job.trips)}`;
        return applyTripUpdate(job, panel.tripId, draft);
      }
      if (panel.type === "chassis" && panel.condition === "available") {
        activityMessage = `Chassis ${panel.unit} assigned to ${targetJobId}.`;
        return assignChassis(job, panel.unit, panel.size);
      }
      if (panel.type === "chassis" && panel.condition === "assigned" && draft.action === "release") {
        activityMessage = `Chassis ${panel.unit} released to the available fleet.`;
        return releaseChassis(job, panel.unit);
      }
      if (panel.type === "freeTime") {
        activityMessage = "Free-time dates confirmed and risk recalculated.";
        return applyFreeTime(job, draft);
      }
      return job;
    });
    setWorkPanel(null);
    setHighlight(nextHighlight);
    window.setTimeout(() => setHighlight(""), 1400);
    showToast(activityMessage);
  }

  function recordCms() {
    updateJob("EXP-260819-001", (job) => applyCheckpoint(job, "cmsCompleted", true));
    flashSequence([
      { value: "readiness", delay: 0 },
      { value: "verdict", delay: 650 },
      { value: "status", delay: 1300 },
      { value: "trip:MOV-001", delay: 1950 },
      { value: "nextAction", delay: 2600 },
    ]);
    showToast("Two empty-collection movements created automatically — one for C1 and one for C2.");
  }

  function recordDetails() {
    updateJob("EXP-260819-002", (job) => applyContainerUpdate(job, 0, { number: "ABCU4471902", seal: "887341", tareKg: 3850, vgmKg: "" }));
    flashSequence([
      { value: "container", delay: 0 },
      { value: "readiness", delay: 700 },
      { value: "trip:MOV-001", delay: 1400 },
      { value: "status", delay: 2100 },
      { value: "nextAction", delay: 2700 },
    ]);
    showToast("Container details recorded. MOV-001 completed and the exception was closed.");
  }

  function setTranshipment(answer) {
    updateJob("EXP-260819-005", (job) => {
      const next = applyCheckpoint(job, "transhipment", answer);
      const withoutBranch = next.trips.filter((trip) => !["Direct Laden to Port", "One-Way Loaded"].includes(trip.type));
      if (answer === "available") {
        const container = jobContainers(next)[0];
        return {
          ...next,
          carparkRequested: false,
          trips: [...withoutBranch, {
            id: "MOV-002",
            route: "Golden Harvest Foods → PSA Tuas",
            type: "Direct Laden to Port",
            status: "Pending",
            plannedDate: null,
            containerRef: container?.ref,
            containerNumber: container?.number || undefined,
            collectedTime: "",
            deliveredTime: "",
            createdAutomatically: true,
          }],
        };
      }
      return { ...next, carparkRequested: null, trips: withoutBranch };
    });
    if (answer === "available") {
      flashSequence([{ value: "readiness", delay: 0 }, { value: "trip:MOV-002", delay: 700 }, { value: "status", delay: 1400 }]);
      showToast("MOV-002 Direct Laden to Port created. Both trips remain under EXP-260819-005.");
    } else {
      setHighlight("readiness");
      window.setTimeout(() => setHighlight(""), 1200);
      showToast("Transhipment marked not available. Confirm whether the customer wants the company carpark.");
    }
  }

  function carparkDecision(useCarpark) {
    updateJob("EXP-260819-005", (job) => {
      const next = applyCheckpoint(job, "deliveryPath", useCarpark ? "carpark" : "other");
      const container = jobContainers(next)[0];
      return {
        ...next,
        trips: useCarpark ? [...next.trips, {
          id: "MOV-002",
          route: `Golden Harvest Foods → ${CARPARK}`,
          type: "One-Way Loaded",
          status: "Pending",
          plannedDate: null,
          containerRef: container?.ref,
          containerNumber: container?.number || undefined,
          collectedTime: "",
          deliveredTime: "",
          createdAutomatically: true,
        }] : next.trips,
      };
    });
    if (useCarpark) {
      flashSequence([{ value: "trip:MOV-002", delay: 0 }, { value: "status", delay: 700 }, { value: "nextAction", delay: 1400 }]);
      showToast("MOV-002 One-Way Loaded created. The carpark path remains under EXP-260819-005.");
    } else {
      showToast("Carpark declined. The job remains blocked until a delivery path is agreed.");
    }
  }

  function carparkAvailable() {
    updateJob("EXP-260815-004", (job) => {
      const next = applyCheckpoint(job, "transhipment", "available");
      const container = jobContainers(next)[0];
      return {
        ...next,
        trips: next.trips.some((trip) => trip.id === "MOV-003") ? next.trips : [...next.trips, {
          id: "MOV-003",
          route: `${CARPARK} → PSA Tuas`,
          type: "Carpark to Port",
          status: "Pending",
          plannedDate: null,
          containerRef: container?.ref,
          containerNumber: container?.number || undefined,
          collectedTime: "",
          deliveredTime: "",
          createdAutomatically: true,
        }],
      };
    });
    flashSequence([{ value: "readiness", delay: 0 }, { value: "trip:MOV-003", delay: 700 }, { value: "status", delay: 1400 }, { value: "nextAction", delay: 2100 }]);
    showToast("Trip MOV-003 Carpark to Port created. Three trips remain under EXP-260815-004.");
  }

  function applyDocument(result) {
    const fields = result.values;
    const incomingNumbers = new Set((result.containers || []).map((container) => container.number));
    const existingJob = jobs.find((job) => job.type === "Import" && (
      job.billOfLading === fields.billOfLading
      || job.containers?.some((container) => incomingNumbers.has(container.number))
    ));
    const appliedJob = buildImportJobFromDocument(result, jobs, existingJob);
    setJobs((current) => existingJob
      ? current.map((job) => job.id === existingJob.id ? appliedJob : job)
      : [...current, appliedJob]);
    setDocuments((current) => [{
      id: `DOC-${Date.now()}`,
      jobId: appliedJob.id,
      fileName: result.fileName,
      carrier: fields.carrier,
      documentType: fields.documentType,
      extractedCount: result.extractedCount,
      containerCount: result.containers?.length || 1,
    }, ...current]);
    setReturnScreen("documents");
    setSelectedJobId(appliedJob.id);
    setScreen("detail");
    setHighlight("sourceDocument");
    window.setTimeout(() => setHighlight(""), 1500);
    showToast(`${result.extractedCount} document facts and ${appliedJob.containers.length} container${appliedJob.containers.length === 1 ? "" : "s"} applied. ${existingJob ? `Job ${appliedJob.id} updated.` : `Import job ${appliedJob.id} created.`}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetDemo() {
    setJobs(cloneSeedJobs());
    setDocuments([]);
    setClearedMaintenanceUnits([]);
    setWorkPanel(null);
    setScreen("dashboard");
    setReturnScreen("actions");
    setSelectedJobId(null);
    setActionFilter("all");
    setDashboardFilter(null);
    setHighlight("");
    showToast("Demo reset to 19 August 2026 seed data.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", count: jobs.filter((job) => jobStatus(job) !== "Completed").length, icon: LayoutDashboard },
    { id: "actions", label: "Action Required", count: actionJobs.length, icon: ListTodo },
    { id: "documents", label: "Document Intake", count: documents.length, icon: FileSearch },
    { id: "fleet", label: "Chassis Fleet", count: fleet.available.length, icon: Truck },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6f8] font-sans text-[18px] leading-normal text-slate-900">
      <style>{`
        @font-face {
          font-family: "Greenlit Hyperlegible";
          src: url("data:font/woff2;base64,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") format("woff2");
          font-style: normal;
          font-weight: 700;
          font-display: swap;
        }
        :root { color-scheme: light; }
        html { scroll-behavior: smooth; }
        h1, h2, .greenlit-display { font-family: "IBM Plex Sans", "Inter", ui-sans-serif, system-ui, sans-serif; }
        /* MASTER.md caps hierarchy at weight 600. Markup no longer uses 700+; this stays as a guard. */
        .font-black, .font-extrabold, .font-bold { font-weight: 600 !important; }
        * { scrollbar-color: #64748b #e2e8f0; scrollbar-width: auto; }
        button, a { cursor: pointer; -webkit-tap-highlight-color: transparent; transition-duration: 180ms; transition-timing-function: cubic-bezier(.22,1,.36,1); }
        button:disabled { cursor: not-allowed; opacity: .55; }
        input, textarea, select { caret-color: #17418c; }
        ::selection { background: #17418c; color: #ffffff; }
        :focus-visible { outline-color: #0284c7 !important; }
        .greenlit-release-flash { animation: greenlitRelease 1.1s cubic-bezier(.16,1,.3,1); }
        .greenlit-new-row { animation: greenlitRow 1.35s cubic-bezier(.16,1,.3,1); }
        .greenlit-text-flash { animation: greenlitText 1.1s cubic-bezier(.16,1,.3,1); }
        .greenlit-drawer { animation: greenlitDrawer .26s cubic-bezier(.16,1,.3,1); }
        @keyframes greenlitRelease {
          0% { box-shadow: inset 0 0 0 999px rgba(16,185,129,.14), 0 8px 24px rgba(15,35,51,.12); }
          100% { box-shadow: inset 0 0 0 0 rgba(16,185,129,0), 0 0 0 rgba(15,35,51,0); }
        }
        @keyframes greenlitRow {
          0% { background: #d1fae5; clip-path: inset(0 100% 0 0); }
          45% { background: #d1fae5; clip-path: inset(0 0 0 0); }
          100% { background: #ffffff; clip-path: inset(0 0 0 0); }
        }
        @keyframes greenlitText {
          0% { color: #bae6fd; text-shadow: 0 6px 18px rgba(0,0,0,.16); }
          100% { color: white; text-shadow: none; }
        }
        @keyframes greenlitDrawer {
          0% { transform: translateX(34px); opacity: .72; box-shadow: -4px 0 14px rgba(15,35,51,.08); }
          100% { transform: translateX(0); opacity: 1; box-shadow: -20px 0 50px rgba(15,35,51,.22); }
        }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .greenlit-release-flash, .greenlit-new-row, .greenlit-text-flash, .greenlit-drawer { animation-duration: .01ms; animation-iteration-count: 1; }
        }
      `}</style>

      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-md bg-white px-5 py-3 font-semibold text-[#17418c] shadow-lg focus:translate-y-0 focus:outline focus:outline-4 focus:outline-sky-600">Skip to main content</a>

      <header className="sticky top-0 z-40 border-b border-slate-700 bg-[#0f2333] text-white shadow-[0_6px_20px_rgba(15,23,42,0.14)]">
        <div className="mx-auto flex max-w-[1900px] flex-col lg:flex-row lg:items-stretch">
          <div className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-700 px-4 py-3 pr-32 sm:px-6 sm:pr-40 lg:min-w-72 lg:border-b-0 lg:border-r lg:pr-6 xl:min-w-80">
            <div>
              <div className="greenlit-display text-lg font-semibold tracking-[0.04em]">PROJECT GREENLIT</div>
              <div className="mt-1 text-base font-normal text-slate-300">Singapore transport control</div>
            </div>
            <Anchor className="hidden h-6 w-6 text-slate-400 lg:block" aria-hidden="true" />
          </div>
          <nav aria-label="Main navigation" className="grid flex-1 grid-cols-4 lg:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = screen === item.id || (screen === "detail" && returnScreen === item.id);
              return (
                <button key={item.id} type="button" onClick={() => goTo(item.id)} aria-current={active ? "page" : undefined} className={`flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 border-r border-slate-700 px-1 py-2 text-base font-semibold focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-400 sm:min-h-16 sm:flex-row sm:gap-3 sm:px-5 sm:py-3 lg:flex-1 ${active ? "bg-[#18364c] text-white shadow-[inset_0_-3px_0_#38bdf8]" : "text-slate-300 hover:bg-[#142e42] hover:text-white"}`}>
                  <Icon className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden="true" />
                  <span className="text-center leading-tight">{item.label}</span>
                  <span className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full border border-slate-500 bg-[#0f2333] px-1 text-base tabular-nums text-slate-200">{item.count}</span>
                </button>
              );
            })}
          </nav>
          <div className="absolute right-3 top-2 flex min-h-12 items-center justify-end sm:right-5 lg:static lg:min-h-16 lg:px-6 lg:py-3 lg:border-l lg:border-slate-700">
            <button type="button" onClick={resetDemo} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-500 bg-transparent px-3 text-base font-semibold text-slate-200 hover:border-slate-400 hover:bg-[#18364c] hover:text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:px-4">
              <RotateCcw className="h-4 w-4" />
              <span className="sm:hidden">Reset</span>
              <span className="hidden sm:inline">Reset demo</span>
            </button>
          </div>
        </div>
      </header>

      {screen === "dashboard" ? <Dashboard jobs={jobs} actionJobs={actionJobs} chassis={fleet} onOpen={openJob} onShowActions={showActions} onShowFleet={() => goTo("fleet")} /> : null}
      {screen === "actions" ? <ActionRequired jobs={actionJobs} filter={actionFilter} setFilter={setActionFilter} dashboardFilter={dashboardFilter} clearDashboardFilter={() => setDashboardFilter(null)} onOpen={openJob} /> : null}
      {screen === "documents" ? <DocumentIntake documents={documents} onApply={applyDocument} onOpenJob={openJob} /> : null}
      {screen === "fleet" ? <ChassisFleet fleet={fleet} onOpen={openJob} onUnit={(item) => setWorkPanel({ type: "chassis", jobId: item.jobId, unit: item.unit, size: item.size, condition: item.condition })} /> : null}
      {screen === "detail" && selectedJob ? (
        <JobDetail
          job={selectedJob}
          onBack={() => goTo(returnScreen)}
          onRecordCms={recordCms}
          onRecordDetails={recordDetails}
          onSetTranshipment={setTranshipment}
          onCarparkDecision={carparkDecision}
          onCarparkAvailable={carparkAvailable}
          onManage={(type, details) => manageJob(selectedJob.id, type, details)}
          onNextAction={() => manageNextAction(selectedJob.id)}
          highlight={highlight}
        />
      ) : null}

      <OperationsDrawer panel={workPanel} jobs={jobs} onClose={() => setWorkPanel(null)} onCommit={commitOperationalPanel} />

      {toast ? (
        <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 flex max-w-[560px] items-start gap-3 rounded-lg border border-emerald-300 bg-white p-5 text-[18px] font-semibold text-slate-900 shadow-[0_12px_32px_rgba(15,23,42,0.2)]">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast("")} aria-label="Dismiss message" className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600"><X className="h-5 w-5" /></button>
        </div>
      ) : null}
    </div>
  );
}
