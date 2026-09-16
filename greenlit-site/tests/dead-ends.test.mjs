import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Dead ends: a control that renders, takes the click, and goes nowhere.
 *
 * Four have shipped so far, all the same shape — a string handed to something
 * that matches it against a fixed set, where the string is not in the set.
 * Nothing throws. The button looks live, the click is accepted, and the result
 * is a blank screen, an empty drawer, or silence:
 *
 *   goTo("intake")        — no such screen, so the page went blank
 *   onManage("permits")   — no such drawer panel, so it opened empty
 *   job.domain === "..."  — never produced, so the branch never ran
 *   <TripTable job={…}>   — not a declared prop, so trips.length threw
 *
 * None is caught by types, because none of this is typed, and none by a unit
 * test, because each component is correct on its own. They are only visible
 * across the seam between caller and callee, which is what these assert.
 */
const UI = "GreenlitControlTower.jsx";

async function componentSources() {
  const files = [UI];
  for (const entry of await readdir("components")) {
    if (entry.endsWith(".jsx")) files.push(join("components", entry));
  }
  const out = new Map();
  for (const f of files) out.set(f, await readFile(f, "utf8"));
  return out;
}

const sources = await componentSources();
const all = [...sources.values()].join("\n");
const ui = sources.get(UI);

test("every drawer panel a button opens is a panel the drawer renders", () => {
  // onManage("permits") opened "Manage work" with no fields in it: a title, a
  // Cancel and a Save that had nothing to save.
  const rendered = new Set(
    [...ui.matchAll(/panel\.type === "(\w+)"/g)].map((m) => m[1]));
  const requested = new Set(
    [...all.matchAll(/onManage\(\s*"(\w+)"/g)].map((m) => m[1]));

  // `fleet` is handled by manageJob before a panel is ever opened.
  const handledEarly = new Set(
    [...ui.matchAll(/if \(type === "(\w+)"\)/g)].map((m) => m[1]));

  const dead = [...requested].filter((t) => !rendered.has(t) && !handledEarly.has(t));
  assert.deepEqual(dead, [],
    `these open a drawer with nothing in it: ${dead.join(", ")}`);
});

test("every panel the drawer renders can actually be reached", () => {
  // The other direction. A panel nothing opens is not a crash, but it is
  // either dead code or a feature that shipped without a way in.
  const rendered = new Set(
    [...ui.matchAll(/panel\.type === "(\w+)"/g)].map((m) => m[1]));
  const opened = new Set([
    ...[...all.matchAll(/onManage\(\s*"(\w+)"/g)].map((m) => m[1]),
    ...[...ui.matchAll(/type:\s*"(\w+)"/g)].map((m) => m[1]),
    ...[...ui.matchAll(/manageJob\([^,]+,\s*"(\w+)"/g)].map((m) => m[1]),
  ]);

  const unreachable = [...rendered].filter((t) => !opened.has(t));
  assert.deepEqual(unreachable, [],
    `no control opens these panels: ${unreachable.join(", ")}`);
});

test("no button is wired to a handler that does not exist", () => {
  // onClick={someName} where someName was removed with the screen it belonged
  // to. React renders it, the click throws rather than doing nothing, but the
  // shape is the same: a control that cannot do its job.
  const offenders = [];
  for (const [file, src] of sources) {
    for (const m of src.matchAll(/onClick=\{(\w+)\}/g)) {
      const name = m[1];
      const declared = new RegExp(
        `(function|const|let)\\s+${name}\\b|\\b${name}\\s*[,}:]|\\b${name}\\s*=>`)
        .test(src);
      if (!declared) offenders.push(`${file}: onClick={${name}}`);
    }
  }
  assert.deepEqual(offenders, []);
});
