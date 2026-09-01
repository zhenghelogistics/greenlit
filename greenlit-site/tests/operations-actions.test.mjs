import assert from "node:assert/strict";
import test from "node:test";

import { addContainerRecord, applyCheckpoint, applyContainerUpdate, applyTripUpdate, assignChassis, nextTripReference, releaseChassis, removeContainerRecord } from "../lib/operations-actions.mjs";

const importJob = {
  id: "JOB-TEST-001",
  type: "Import",
  customer: "Test Customer",
  terminal: "PSA Tuas",
  deliveryAddress: "Test Customer, Pioneer",
  emptyYard: "YCH Tuas Depot",
  permitReceived: false,
  containers: [{ number: "TCNU1234567", state: "Awaiting permit", lastFreeDay: "2026-08-22" }],
  chassis: [{ unit: 2051, size: "20ft", heldSince: "2026-08-19" }],
  trips: [{ id: "MOV-001", route: "PSA Tuas → Test Customer", type: "Import Delivery", status: "Pending", plannedDate: "2026-08-19", collectedTime: "", deliveredTime: "", containerNumber: "TCNU1234567" }],
};

test("checkpoint updates recalculate related container readiness", () => {
  const updated = applyCheckpoint(importJob, "permitReceived", true);

  assert.equal(updated.permitReceived, true);
  assert.equal(updated.containers[0].state, "Ready");
  assert.match(updated.activity[0].text, /Permit marked complete/);
  assert.equal(importJob.containers[0].state, "Awaiting permit");
});

test("CMS completion creates the permitted export trip once", () => {
  const exportJob = { id: "EXP-TEST-001", type: "Export", emptyYard: "Depot", deliveryAddress: "Customer", trips: [], activity: [] };
  const updated = applyCheckpoint(exportJob, "cmsCompleted", true);
  const repeated = applyCheckpoint(updated, "cmsCompleted", true);

  assert.equal(updated.trips.length, 1);
  assert.equal(updated.trips[0].type, "Empty Collection");
  assert.equal(repeated.trips.length, 1);
});

test("multi-container export creates and tracks one empty movement per container", () => {
  const exportJob = {
    id: "EXP-TEST-002",
    type: "Export",
    emptyYard: "Depot",
    deliveryAddress: "Customer",
    containers: [
      { ref: "C1", number: "", seal: "", tareKg: null, vgmKg: null, detailsSent: false, customerReady: false },
      { ref: "C2", number: "", seal: "", tareKg: null, vgmKg: null, detailsSent: false, customerReady: false },
    ],
    trips: [],
    activity: [],
  };
  const released = applyCheckpoint(exportJob, "cmsCompleted", true);
  const identified = applyContainerUpdate(released, 1, { number: "OOLU8841250", seal: "HLK7788990", tareKg: 3900, vgmKg: "", sizeType: "40 HQ", stuffingLocation: "Customer", detailsSent: true, customerReady: false });

  assert.equal(released.trips.length, 2);
  assert.deepEqual(released.trips.map((trip) => trip.containerRef), ["C1", "C2"]);
  assert.equal(identified.containers[0].number, "");
  assert.equal(identified.containers[1].number, "OOLU8841250");
  assert.equal(identified.containers[1].detailsSent, true);
});

test("container collection enforces uniqueness, movement safety, and the 20-container ceiling", () => {
  let job = { ...importJob, trips: [] };
  job = addContainerRecord(job, { number: "OOLU8841250", state: "Ready", lastFreeDay: "2026-08-22" });
  assert.equal(job.containers.length, 2);
  assert.throws(() => addContainerRecord(job, { number: "OOLU8841250" }), /already on this job/i);

  job = removeContainerRecord(job, 1);
  assert.equal(job.containers.length, 1);

  for (let index = 2; index <= 20; index += 1) {
    job = addContainerRecord(job, { number: `TCNU${String(1234567 + index).padStart(7, "0")}` });
  }
  assert.equal(job.containers.length, 20);
  assert.throws(() => addContainerRecord(job, { number: "MSKU7654321" }), /up to 20 containers/i);
});

test("delivering the final import container completes delivery and creates empty return", () => {
  const updated = applyContainerUpdate(importJob, 0, { number: "TCNU1234567", state: "Delivered", lastFreeDay: "2026-08-22" });

  assert.equal(updated.containers[0].state, "Delivered");
  assert.equal(updated.trips[0].status, "Completed");
  assert.equal(updated.trips[1].type, "Empty Return");
  assert.equal(updated.trips[1].status, "Pending");
});

test("trip completion updates its container and releases chassis on empty return", () => {
  const jobWithReturn = { ...importJob, containers: [{ ...importJob.containers[0], state: "Delivered" }], trips: [{ id: "MOV-002", route: "Customer → Depot", type: "Empty Return", status: "Pending", plannedDate: null, collectedTime: "", deliveredTime: "" }] };
  const updated = applyTripUpdate(jobWithReturn, "MOV-002", { route: "Customer → Depot", type: "Empty Return", status: "Completed", plannedDate: "2026-08-19" });

  assert.equal(updated.trips[0].status, "Completed");
  assert.equal(updated.chassis[0].released, true);
  assert.ok(updated.trips[0].collectedTime);
  assert.ok(updated.trips[0].deliveredTime);
});

test("chassis assignment and release preserve the job audit trail", () => {
  const withoutChassis = { ...importJob, chassis: [], activity: [] };
  const assigned = assignChassis(withoutChassis, 2077, "20ft");
  const released = releaseChassis(assigned, 2077);

  assert.equal(assigned.chassis[0].unit, 2077);
  assert.equal(released.chassis[0].released, true);
  assert.equal(released.activity.length, 2);
  assert.equal(nextTripReference([{ id: "MOV-009" }]), "MOV-010");
});
