import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { jobFromApi } from "../lib/job-adapter.mjs";

/**
 * The adapter's output must match the shape the screens consume. A field of
 * the wrong TYPE is the failure mode that actually bit: chassis was mapped to
 * a string while the screens call .filter on it, which threw at runtime with
 * "(job.chassis || []).filter is not a function".
 *
 * Types are asserted against the seed shape, which is what every screen was
 * written against.
 */
const view = {
  record: {
    createdAt: "2026-08-18T01:00:00Z", bookingReference: "SGSIN12345",
    vesselName: "ONE Splendour", voyageNumber: "114E", cmsStatus: "COMPLETED",
    emptyCollectionYard: "EK11 Depot", containerQuantity: 2,
    containerSizeType: "40 HQ", transhipmentStatus: "PENDING",
    permitReceived: false, portnetReleased: false,
  },
  storedContainers: [
    { containerRef: "C1", containerNumber: "ABCU9876543", sealNumber: "123456",
      tareWeightKg: 3850, sizeType: "40 HQ", chassisId: "CH-4011",
      chassisMountedAt: "2026-08-19T02:00:00Z", chassisReleasedAt: null,
      demurrageLfd: "2026-09-01", containerDetailsSent: true, containerReady: true,
      carparkArrivedAt: "2026-08-23T05:30:00Z", containerReadyAt: "2026-08-22T01:00:00Z" },
    { containerRef: "C2", containerNumber: null, sizeType: "20 GP", chassisId: null },
  ],
  jobId: "ej1", jobNumber: "EXP-260818-002", domain: "EXPORT", customer: "ABC Pte Ltd",
  jobStatus: "Awaiting T/T", location: "Company Carpark",
  nextActionRequired: "Await transhipment", blockingReason: "Transhipment pending",
  waitingOn: "CARRIER", mandatoryComplete: true, missingInformation: [],
  containers: [{ status: "Awaiting T/T" }, { status: "Empty Collection Scheduled" }],
  movements: [{ movementRef: "MOV-001", movementType: "EMPTY_COLLECTION",
    movementStatus: "COMPLETED", origin: "EK11", destination: "Site A",
    plannedDate: "2026-08-19", autoCreated: true }],
};

test("array-shaped fields are arrays, not scalars", () => {
  const job = jobFromApi(view);
  for (const key of ["chassis", "containers", "trips", "missingInformation"]) {
    assert.ok(Array.isArray(job[key]), `${key} must be an array; screens call array methods on it`);
  }
  // The exact call that threw in production.
  assert.doesNotThrow(() => (job.chassis || []).filter((c) => !c.released));
});

test("chassis holdings carry the fields the fleet view reads", () => {
  const job = jobFromApi(view);
  assert.equal(job.chassis.length, 1, "only mounted containers contribute a holding");
  const [held] = job.chassis;
  assert.equal(held.unit, "CH-4011");
  assert.equal(held.size, "40ft");
  assert.equal(held.heldSince, "2026-08-19");
  assert.equal(held.released, false);
});

test("container entries carry the keys the panels read", () => {
  const [c1] = jobFromApi(view).containers;
  for (const key of ["number", "state", "lastFreeDay"]) {
    assert.ok(key in c1, `container.${key} is read by the screens`);
  }
  assert.equal(c1.state, "Awaiting T/T", "state is the engine's derived status");
});

test("derived values pass through and are never recomputed", () => {
  const job = jobFromApi(view);
  assert.deepEqual(job.derived, {
    status: "Awaiting T/T",
    location: "Company Carpark",
    nextAction: "Await transhipment",
    blocking: "Transhipment pending",
    waitingOn: "Carrier",
  });
});

test("a job with no mounted chassis produces an empty array, not null", () => {
  const bare = { ...view, storedContainers: [{ containerRef: "C1", sizeType: "20 GP" }] };
  const job = jobFromApi(bare);
  assert.deepEqual(job.chassis, []);
  assert.doesNotThrow(() => job.chassis.filter(Boolean));
});

test("every key the seed shape defines is produced by the adapter", async () => {
  const src = await readFile(new URL("../GreenlitControlTower.jsx", import.meta.url), "utf8");
  const start = src.indexOf("export const SEED_JOBS");
  const firstJob = src.slice(src.indexOf("{", start), start + 4000);
  const seedKeys = [...firstJob.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  const produced = new Set(Object.keys(jobFromApi(view)));
  const missing = [...new Set(seedKeys)].filter((k) => !produced.has(k));
  assert.deepEqual(missing, [], `adapter is missing keys the screens expect: ${missing.join(", ")}`);
});
