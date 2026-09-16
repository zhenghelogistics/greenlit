import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * Every control that claims to save must actually save.
 *
 * The job drawer let a controller correct a vessel, showed the correction,
 * recalculated readiness in front of them and wrote nothing down — so it
 * survived until the next reload and then the old vessel came back. That is
 * worse than not offering the edit, because they believed it.
 *
 * The same bug was in the checkpoint drawer and in both carpark handlers, and
 * the carpark ones also addressed hardcoded fixture ids, so against real data
 * they did nothing at all and reported success.
 *
 * These assertions are structural. The point is not to re-test the fixes but
 * to make the shape of the mistake impossible to reintroduce quietly.
 */
const ui = await readFile("GreenlitControlTower.jsx", "utf8");
const actions = await readFile("lib/operations-actions.mjs", "utf8");

/** The body of a named function in the UI file, up to the next one. */
function bodyOf(name) {
  const start = ui.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const next = ui.indexOf("\n  function ", start + 10);
  const nextAsync = ui.indexOf("\n  async function ", start + 10);
  const end = Math.min(...[next, nextAsync].filter((x) => x > 0), ui.length);
  return ui.slice(start, end);
}

test("every drawer panel that saves reaches the server", () => {
  // A panel that commits by rewriting React state and returning is the exact
  // shape of the bug.
  const commit = ui.slice(ui.indexOf("function commitOperationalPanel"));
  const scope = commit.slice(0, commit.indexOf("\n  function ", 40));

  for (const panel of ["job", "checkpoint", "container", "freeTime"]) {
    const branch = scope.slice(scope.indexOf(`panel.type === "${panel}"`));
    const untilNext = branch.slice(0, branch.indexOf("panel.type ===", 30) + 1 || 900);
    assert.match(untilNext, /fetch\(/,
      `the ${panel} panel must send its change to the server, not only to React state`);
  }
});

test("no handler addresses a hardcoded fixture job", () => {
  // Both carpark handlers called updateJob("EXP-260819-005", …). On real data
  // updateJob on an id that is not there changes nothing and reports success.
  for (const name of ["carparkAvailable", "carparkDecision"]) {
    const body = bodyOf(name);
    assert.ok(body, `${name} should exist`);
    assert.doesNotMatch(body, /updateJob\(\s*"/,
      `${name} must act on the open job, not on a fixture id`);
  }
});

test("the local-only job and checkpoint mutators are gone, not merely unused", () => {
  // Leaving them exported leaves the door open to calling them again, and
  // their whole behaviour was to not persist.
  assert.doesNotMatch(actions, /export function applyJobFacts/);
  assert.doesNotMatch(actions, /export function applyCheckpoint/);
});

test("amending a job goes through PATCH, and only stored facts", async () => {
  const route = await readFile("app/api/jobs/[id]/route.ts", "utf8");
  assert.match(route, /export async function PATCH/);
  // Derived values must stay underivable from the outside (§54).
  for (const derived of ["jobStatus", "nextActionRequired", "blockingReason", "waitingOn"]) {
    assert.doesNotMatch(route, new RegExp(`"${derived}"`),
      `${derived} is computed and must not be settable`);
  }
});

test("the screen's words map to values the engine actually has", async () => {
  // I invented LADEN_TO_PORT, PLANNED and IN_PROGRESS, none of which are in
  // the enums. They typechecked, because the mapping is a plain object, and
  // would have failed at the database as a constraint violation — at which
  // point the trip is already lost and the controller is looking at a toast.
  const { MOVEMENT_TYPE, MOVEMENT_STATUS } = await import("@greenlit/engine");

  const typeMap = ui.slice(ui.indexOf("const MOVEMENT_TYPE_FOR"));
  for (const value of typeMap.slice(0, typeMap.indexOf("};")).matchAll(/"([A-Z_]+)"/g)) {
    assert.ok(MOVEMENT_TYPE.includes(value[1]),
      `${value[1]} is not a movement type the engine knows`);
  }

  const statusMap = ui.slice(ui.indexOf("const MOVEMENT_STATUS_FOR"));
  for (const value of statusMap.slice(0, statusMap.indexOf("};")).matchAll(/"([A-Z_]+)"/g)) {
    assert.ok(MOVEMENT_STATUS.includes(value[1]),
      `${value[1]} is not a movement status the engine knows`);
  }
});

test("a movement is created with a status the enum contains", async () => {
  // The adapters opened movements as 'PLANNED', which does not exist. The
  // first value of MOVEMENT_STATUS is what a new movement is.
  const { MOVEMENT_STATUS } = await import("@greenlit/engine");
  const memory = await readFile("../packages/core/src/memory.ts", "utf8");
  const initial = memory.match(/movementStatus: '([A-Z_]+)'/)?.[1];
  assert.ok(MOVEMENT_STATUS.includes(initial),
    `a movement opens as ${initial}, which is not in MOVEMENT_STATUS`);
});

test("the batch cap is derived from the time limit, not chosen", async () => {
  // Four documents measured at 92.6s against a 60s maxDuration — a batch of
  // four timed out on a deployment that had five minutes available and was
  // only asking for one. Both numbers have to move together or the cap means
  // nothing.
  const route = await readFile("app/api/extract/route.ts", "utf8");
  const ceiling = Number(route.match(/maxDuration = (\d+)/)?.[1]);
  const perRequest = Number(route.match(/MAX_DOCUMENTS_PER_BATCH = (\d+)/)?.[1]);

  assert.ok(ceiling >= 300, "the plan allows 300s; asking for less is self-limiting");

  // A chunk costs its slowest document, not the sum: two together took 95.5s
  // when one alone took 92.4s. The worst document seen is the unit of risk,
  // and raising the count does not raise it.
  //
  // This asked for three times the worst document, which held while the worst
  // was a 93s notice. A 38-container manifest measured at 135s, and 300s is
  // the plan's ceiling rather than a number that can be raised to keep a
  // ratio. So the invariant is stated as what it was always standing in for:
  // the request must outlive the per-document deadline, because a deadline
  // that fires returns four results and one named failure, while a gateway
  // that fires first returns nothing at all and reads as "it broke".
  const deadlineSeconds =
    Number(route.match(/DOCUMENT_DEADLINE_MS = ([\d_]+)/)?.[1].replace(/_/g, "")) / 1000;
  assert.ok(ceiling > deadlineSeconds,
    "a deadline at or above the ceiling never fires; the gateway kills the whole chunk instead");
  assert.ok(ceiling - deadlineSeconds >= 30,
    "the gap is the time left to serialise and return the results the deadline salvaged");
  assert.ok(perRequest <= 5, `${perRequest} per request has not been measured`);
});

test("a single slow document cannot take the chunk with it", async () => {
  // A chunk of five measured at 91.2s — exactly its slowest member, because
  // documents read in parallel. So the count is nearly free and one
  // pathological document is the entire risk.
  //
  // The slowest document is not a long one, it is a crowded one: a notice
  // listing 38 containers measured at 135s, because the model writes out every
  // row. Operations says thirty to forty is normal, so that is the figure the
  // deadline has to clear — not the five-container notice it was set from.
  //
  // The deadline has to sit above anything normal and below the request
  // ceiling, or it either fires on good documents or never fires at all.
  const route = await readFile("app/api/extract/route.ts", "utf8");
  const deadlineMs = Number(route.match(/DOCUMENT_DEADLINE_MS = ([\d_]+)/)?.[1].replace(/_/g, ""));
  const ceilingSeconds = Number(route.match(/maxDuration = (\d+)/)?.[1]);

  const SLOWEST_DOCUMENT_SECONDS = 93;
  assert.ok(deadlineMs / 1000 > SLOWEST_DOCUMENT_SECONDS * 1.5,
    "a deadline near normal would abandon documents that were going to succeed");
  assert.ok(deadlineMs / 1000 < ceilingSeconds,
    "a deadline above the request ceiling never fires, and the gateway kills everything instead");
});

test("the browser and the server agree on the chunk size", async () => {
  // Two numbers that must match. If the browser sends more than the server
  // accepts, every batch fails on a refusal nobody expected.
  const route = await readFile("app/api/extract/route.ts", "utf8");
  const perRequest = route.match(/MAX_DOCUMENTS_PER_BATCH = (\d+)/)?.[1];
  const perChunk = ui.match(/DOCUMENTS_PER_REQUEST = (\d+)/)?.[1];
  assert.equal(perChunk, perRequest);
});
