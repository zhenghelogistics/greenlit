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
