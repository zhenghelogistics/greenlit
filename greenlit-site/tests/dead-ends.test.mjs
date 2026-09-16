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

test("every section in the rail is a screen, and every screen is reachable", () => {
  // §7. The rail is now filtered by role, so a section listed for a role that
  // no route renders would be a nav item leading to a blank page — the same
  // dead end as goTo("intake"), reintroduced through the filter instead.
  const rendered = new Set(
    [...ui.matchAll(/current === "(\w+)"/g)].map((m) => m[1]));

  // Only the rail's own array. `{ id: "all", label: … }` also describes the
  // Action Required filter chips, which are not sections and render nothing.
  const railArray = ui.slice(ui.indexOf("const allSections = ["));
  const listed = new Set(
    [...railArray.slice(0, railArray.indexOf("];")).matchAll(/\{ id: "(\w+)", label:/g)]
      .map((m) => m[1]));
  const grouped = new Set(
    [...ui.matchAll(/^const (?:ASSISTANT|CONTROLLER)_SECTIONS = \[([^\]]*)\]/gm)]
      .flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1])));

  const dead = [...listed, ...grouped].filter((id) => !rendered.has(id));
  assert.deepEqual([...new Set(dead)], [],
    `the rail offers sections nothing renders: ${[...new Set(dead)].join(", ")}`);

  // And nothing in a role's list is absent from the full set, which would be
  // a section quietly missing from one role's rail.
  const unknown = [...grouped].filter((id) => !listed.has(id));
  assert.deepEqual(unknown, [],
    `a role is offered sections the rail does not define: ${unknown.join(", ")}`);
});

test("every ported screen renders inside the scope its stylesheet needs", async () => {
  // app/zht.css is scoped to `.zht` so it cannot restyle the screens that have
  // not been ported. A component that forgets the wrapper therefore renders as
  // completely unstyled markup — no cards, no grid, the sidebar overlapping
  // the text — and nothing throws, so no other check sees it.
  const offenders = [];
  for (const [file, src] of sources) {
    if (!file.startsWith("components/Zht")) continue;
    if (!/className="zht"/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [],
    `these use his class names with none of his stylesheet: ${offenders.join(", ")}`);
});

test("every checkpoint a control opens has a route that records it", () => {
  // The journey opened the checkpoint drawer without saying which checkpoint,
  // so the commit handler could not pick a route and Save did nothing — the
  // drawer just sat there. A drawer that opens and cannot save is the same
  // silent failure as a button that navigates nowhere.
  const opened = new Set(
    [...all.matchAll(/onManage\(\s*"checkpoint",\s*\{\s*key:\s*"(\w+)"/g)].map((m) => m[1]));

  const commit = ui.slice(ui.indexOf('if (panel.type === "checkpoint") {'));
  const routed = new Set(
    [...commit.slice(0, 900).matchAll(/panel\.key === "(\w+)"/g)].map((m) => m[1]));

  const unroutable = [...opened].filter((k) => !routed.has(k));
  assert.deepEqual(unroutable, [],
    `these open a checkpoint drawer nothing can save: ${unroutable.join(", ")}`);
});

test("every action the journey can raise is one the screen routes", async () => {
  // The journey names commands; the screen turns them into controls. A step
  // naming an action the screen has no branch for renders a button that does
  // nothing — the same silent failure as the rest of this file, arriving
  // through the engine instead of through a typo.
  const journeySrc = await readFile("../packages/engine/src/journey.ts", "utf8");
  // Every quoted command name in the module, however the call happens to end.
  // The first version only matched actions followed by `')`, which silently
  // skipped half of them — a guard that passes because it is not looking.
  const raised = new Set(
    [...journeySrc.matchAll(/'([a-z]+\.[a-zA-Z]+)'/g)].map((m) => m[1]));

  const detail = sources.get("components/ZhtJobDetail.jsx") ?? "";
  const routed = new Set(
    [...detail.matchAll(/action === "([a-z]+\.[a-zA-Z]+)"/g)].map((m) => m[1]));

  const unrouted = [...raised].filter((a) => !routed.has(a));
  assert.deepEqual(unrouted, [],
    `the journey offers actions the screen cannot perform: ${unrouted.join(", ")}`);
});

test("a container route serves both domains, not whichever it was written for", async () => {
  // The container routes called addContainerToJob / amendContainer /
  // removeContainerFromJob whatever the job was, and those write to the import
  // `containers` table. On an export booking they addressed a job id that
  // table has never heard of, so Add Container was broken on every export job
  // from the day the route was written — and nothing said so, because the
  // failure is a foreign key deep in the adapter rather than a refusal.
  const files = [
    "app/api/jobs/[id]/containers/route.ts",
    "app/api/jobs/[id]/containers/[containerId]/route.ts",
  ];
  for (const f of files) {
    const src = await readFile(f, "utf8");
    assert.match(src, /getExportJob\(/,
      `${f} must decide which kind of container it is handling`);
    assert.match(src, /ExportContainer\(/,
      `${f} must reach the export container commands for an export job`);
  }
});

test("a control that shows a value also sends it", async () => {
  // §43. The container drawer has shown a "customer confirms container ready"
  // choice and a VGM field since it was written, and sent neither: the PATCH
  // carries identity fields only, and the two commands that record these have
  // their own routes. Both controls looked like they saved and did not — the
  // same shape as the six persistence bugs before them.
  const commit = ui.slice(ui.indexOf("function commitOperationalPanel"));
  const scope = commit.slice(0, commit.indexOf("\n  function ", 40));

  for (const [control, route] of [["customerReady", "/ready"], ["vgmKg", "/vgm"]]) {
    assert.ok(ui.includes(control),
      `${control} is offered by the drawer`);
    assert.ok(scope.includes(route),
      `${control} is offered but nothing sends it to ${route}`);
  }
});
