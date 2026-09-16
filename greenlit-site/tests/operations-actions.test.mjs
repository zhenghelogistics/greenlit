import assert from "node:assert/strict";
import test from "node:test";

import { addContainerRecord, applyContainerUpdate, applyTripUpdate, assignChassis, nextTripReference, releaseChassis, removeContainerRecord } from "../lib/operations-actions.mjs";

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




test("container collection enforces uniqueness and movement safety", () => {
  let job = { ...importJob, trips: [] };
  job = addContainerRecord(job, { number: "OOLU8841250", state: "Ready", lastFreeDay: "2026-08-22" });
  assert.equal(job.containers.length, 2);
  assert.throws(() => addContainerRecord(job, { number: "OOLU8841250" }), /already on this job/i);

  job = removeContainerRecord(job, 1);
  assert.equal(job.containers.length, 1);

  // No ceiling. A single arrival notice routinely lists thirty to forty
  // containers, and the cap that used to sit here refused exactly the job such
  // a document creates — after the extractor had read it correctly.
  for (let index = 2; index <= 40; index += 1) {
    job = addContainerRecord(job, { number: `TCNU${String(1234567 + index).padStart(7, "0")}` });
  }
  assert.equal(job.containers.length, 40);
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
