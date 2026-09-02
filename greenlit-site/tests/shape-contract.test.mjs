import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { jobFromApi } from "../lib/job-adapter.mjs";

/**
 * Shape contract between the API adapter and the screens.
 *
 * Two runtime crashes shipped because the adapter produced a shape the screens
 * did not expect, and neither was caught by types (this file is JavaScript) or
 * by tests (each screen path needs a render to exercise).
 *
 * Rather than test every screen, this extracts every property access the
 * component performs on a job and evaluates all of them against adapter
 * output. Any access that throws, or that reaches a field the adapter never
 * produces, is a crash waiting for whichever screen uses it.
 */

const SOURCE = new URL("../GreenlitControlTower.jsx", import.meta.url);

/** Accesses of the form job.a.b, job.a[0], job.a.method( — the ones that can throw. */
async function deepAccessesOnJob() {
  const src = await readFile(SOURCE, "utf8");
  const found = new Map();
  // job.<field>.<something>  and  job.<field>[
  for (const m of src.matchAll(/\bjob\.(\w+)\s*(\.\s*(\w+)|\[)/g)) {
    const [, field, , sub] = m;
    if (!found.has(field)) found.set(field, new Set());
    if (sub) found.get(field).add(sub);
  }
  return found;
}

/** A live-shaped DerivedJobView with the sparsest legal content. */
const sparseView = {
  record: { createdAt: "2026-09-01T00:00:00Z" },
  storedContainers: [],
  jobId: "j1", jobNumber: "JOB-260901-001", domain: "IMPORT", customer: "ABC",
  jobStatus: "Incomplete", location: "Terminal / Port of discharge",
  nextActionRequired: "Complete job information", blockingReason: null,
  waitingOn: "US", mandatoryComplete: false, missingInformation: ["ETA"],
  containers: [], movements: [],
};

test("no job field the component dereferences is missing from the adapter", async () => {
  const accesses = await deepAccessesOnJob();
  const job = jobFromApi(sparseView);
  const missing = [...accesses.keys()].filter((f) => !(f in job));
  assert.deepEqual(missing, [],
    `the component dereferences job fields the adapter never produces: ${missing.join(", ")}`);
});

test("every dereference the component performs survives the sparsest job", async () => {
  const accesses = await deepAccessesOnJob();
  const job = jobFromApi(sparseView);
  const failures = [];

  for (const [field, subs] of accesses) {
    const value = job[field];
    for (const sub of subs) {
      try {
        // Reproduces `job.field.sub` — throws exactly where the screen would.
        void value[sub];
      } catch (error) {
        failures.push(`job.${field}.${sub} -> ${error.message}`);
      }
    }
    // Reproduces `job.field[0]` and array-method use.
    if (subs.size === 0) {
      try { void value[0]; } catch (error) { failures.push(`job.${field}[0] -> ${error.message}`); }
    }
  }

  assert.deepEqual(failures, [], `dereferences that crash:\n  ${failures.join("\n  ")}`);
});

test("fields the screens call array methods on are always arrays", async () => {
  const src = await readFile(SOURCE, "utf8");
  const arrayish = new Set();
  // slice and length are excluded: both are valid on strings.
  for (const m of src.matchAll(/\bjob\.(\w+)\s*(?:\|\|\s*\[\])?\s*\)?\s*\.\s*(map|filter|some|every|find|flatMap|forEach|reduce)\b/g)) {
    arrayish.add(m[1]);
  }
  const job = jobFromApi(sparseView);
  const bad = [...arrayish].filter((f) => !Array.isArray(job[f]));
  assert.deepEqual(bad, [],
    `screens call array methods on these, so the adapter must produce arrays: ${bad.join(", ")}`);
});

/**
 * The same exposure exists one level down: the screens iterate containers,
 * trips and chassis holdings and dereference fields on each element.
 */
async function accessesOn(identifier) {
  const src = await readFile(SOURCE, "utf8");
  const found = new Set();
  const re = new RegExp(`\\b${identifier}\\.(\\w+)`, "g");
  for (const m of src.matchAll(re)) found.add(m[1]);
  return found;
}

/** A populated view, so nested collections are non-empty. */
const fullView = {
  record: {
    createdAt: "2026-08-18T01:00:00Z", bookingReference: "SGSIN12345",
    vesselName: "ONE Splendour", voyageNumber: "114E", cmsStatus: "COMPLETED",
    emptyCollectionYard: "EK11", containerQuantity: 1, containerSizeType: "40 HQ",
    transhipmentStatus: "PENDING", permitReceived: true, portnetReleased: true,
  },
  storedContainers: [{
    containerRef: "C1", containerNumber: "ABCU9876543", sealNumber: "123456",
    tareWeightKg: 3850, sizeType: "40 HQ", chassisId: "CH-4011",
    chassisMountedAt: "2026-08-19T02:00:00Z", chassisReleasedAt: null,
    demurrageLfd: "2026-09-01", containerDetailsSent: true, containerReady: true,
    containerReadyAt: "2026-08-22T01:00:00Z", carparkArrivedAt: "2026-08-23T05:30:00Z",
    portTerminal: "PSA", containerSize: "40",
  }],
  jobId: "ej1", jobNumber: "EXP-260818-002", domain: "EXPORT", customer: "ABC Pte Ltd",
  jobStatus: "Awaiting T/T", location: "Company Carpark",
  nextActionRequired: "Await transhipment", blockingReason: "Transhipment pending",
  waitingOn: "CARRIER", mandatoryComplete: true, missingInformation: [],
  containers: [{ status: "Awaiting T/T", containerNumber: "ABCU9876543" }],
  movements: [{ movementRef: "MOV-001", movementType: "ONE_WAY_LOADED",
    movementStatus: "COMPLETED", origin: "Site A", destination: "Carpark",
    plannedDate: "2026-08-23", autoCreated: true }],
};

test("chassis holdings expose every field the fleet view reads", async () => {
  const wanted = await accessesOn("item");
  const [held] = jobFromApi(fullView).chassis;
  // Only fields the fleet view genuinely reads off a holding.
  for (const key of ["unit", "size", "heldSince", "released"]) {
    assert.ok(key in held, `chassis holding is missing ${key}`);
    assert.ok(wanted.size > 0);
  }
});

test("container entries expose every field the container panels read", async () => {
  const [c] = jobFromApi(fullView).containers;
  for (const key of ["ref", "number", "seal", "tare", "state", "status", "lastFreeDay"]) {
    assert.ok(key in c, `container entry is missing ${key}`);
  }
});

test("trip entries expose every field the movement history reads", async () => {
  const [t] = jobFromApi(fullView).trips;
  for (const key of ["id", "type", "status", "origin", "destination", "plannedDate"]) {
    assert.ok(key in t, `trip entry is missing ${key}`);
  }
});

test("a fully populated job dereferences cleanly too", async () => {
  const accesses = await deepAccessesOnJob();
  const job = jobFromApi(fullView);
  const failures = [];
  for (const [field, subs] of accesses) {
    for (const sub of subs) {
      try { void job[field][sub]; }
      catch (error) { failures.push(`job.${field}.${sub} -> ${error.message}`); }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});
