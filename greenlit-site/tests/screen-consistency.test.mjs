import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Two rules about what a screen may say, both found the hard way.
 *
 * A job screen's whole job is to say what to do next. Both of these are about
 * it saying something a person cannot act on:
 *
 *   truckInDate, truckOutDate  required on every export, with no input
 *                              anywhere. Nothing a user could do would ever
 *                              satisfy it. It appeared only as an <option> in
 *                              the date-amendment list — you could change it
 *                              once it existed, and never set it.
 *   Record CMS completed       offered on every import, forever. CMS is the
 *                              export empty-collection step; an import has no
 *                              empty to collect.
 *
 * Neither is a type error and neither breaks a unit test, because each piece
 * is correct on its own. They live in the seam between what a rule demands and
 * what a form offers.
 */

async function componentSources() {
  const files = ["GreenlitControlTower.jsx"];
  for (const entry of await readdir("components")) {
    if (entry.endsWith(".jsx")) files.push(join("components", entry));
  }
  const out = new Map();
  for (const f of files) out.set(f, await readFile(f, "utf8"));
  return out;
}

const sources = await componentSources();
const all = [...sources.values()].join("\n");

/**
 * Which control fills each field a job can be blocked for.
 *
 * Written out rather than matched by name, because the two genuinely differ:
 * the rule is blocked on `customer` and the form binds `customerCode`, and no
 * amount of string matching makes that safe to guess. The map is the claim —
 * "this rule is satisfiable, here" — and both halves of it are checked below.
 */
const FILLED_BY = {
  customer: "job.customerCode",
  deliveryAddress: "job.deliveryAddress",
  blNumber: "job.blNumber",
  vesselName: "job.vesselName",
  voyageNumber: "job.voyageNumber",
  eta: "job.etaDate",
  shipper: "job.shipper",
  bookingReference: "job.bookingReference",
  exportClearanceReference: "job.exportClearanceReference",
  etaSingapore: "job.etaDate",
  emptyCollectionYard: "job.emptyCollectionYard",
  containerQuantity: "s.quantity",
  containerSizeType: "s.sizeType",
};

test("every field a job can be blocked for has somewhere to enter it", async () => {
  // A gate no input can pass is not a gate, it is a wall. Operations hit one:
  // every export job was permanently short of mandatory information because
  // two required fields existed on the record and on no screen.
  //
  // Read from the service rather than restated here, so adding a required
  // field without a way to fill it fails in this test rather than in front of
  // a controller.
  const service = await readFile("../packages/core/src/service.ts", "utf8");
  const setOf = (name) => {
    const block = service.slice(service.indexOf(`export const ${name}`));
    return [...block.slice(0, block.indexOf("};")).matchAll(/'([a-zA-Z]+)'/g)]
      .map((m) => m[1]);
  };
  const required = [...new Set([...setOf("IMPORT_MANDATORY"), ...setOf("EXPORT_MANDATORY")])];

  const unnamed = required.filter((field) => !(field in FILLED_BY));
  assert.deepEqual(unnamed, [],
    "these block a job and nothing says which control fills them");

  // The other half: the control named has to be a real bound expression
  // somewhere in the markup — `value={job.blNumber}`, or handed to a control
  // as `date={job.etaDate}`. An <option value="truckInDate"> is a string and
  // not a binding, which is the whole distinction: it let somebody amend the
  // date once it existed and never set it in the first place.
  const missingControl = required.filter((field) => {
    const binding = FILLED_BY[field].replace(".", "\\.");
    return !new RegExp(`\\{\\s*${binding}\\s*\\}`).test(all);
  });
  assert.deepEqual(missingControl, [],
    "these name a control that no screen actually renders");
});

/** Split on `||` that is not inside brackets, so each branch stands alone. */
function branches(condition) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < condition.length; i += 1) {
    const c = condition[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (depth === 0 && c === "|" && condition[i + 1] === "|") {
      out.push(condition.slice(start, i));
      start = i + 2;
    }
  }
  out.push(condition.slice(start));
  return out;
}

test("a saved job is organised the way the form that made it was", () => {
  // Operations filled in Customer & delivery, Shipment, Containers and Permit,
  // opened the saved job, and found a different set of panels with nothing in
  // the place they had just put it — and so nothing they could find to correct.
  //
  // Both screens now build their tab bar from a list of the same shape, so the
  // check is that the two lists agree: same ids, same labels, same order.
  const sectionsIn = (source) =>
    [...source.matchAll(/id: "(sec-[a-z]+)", label: "([^"]+)"/g)]
      .map((m) => `${m[1]}: ${m[2]}`);

  const creation = sectionsIn(sources.get("components/ZhtNewJob.jsx"));
  const detail = sectionsIn(sources.get("components/ZhtJobDetail.jsx"));

  assert.ok(creation.length >= 4, "expected the creation form's sections to be found");
  assert.deepEqual(detail, creation,
    "the saved job shows different sections from the form that made it");
});

test("an action only one domain has is only offered to that domain", () => {
  // "Record CMS completed" was gated on `!job.cmsCompleted` alone, which is
  // true of every import forever, while the two branches beside it checked the
  // job type correctly.
  //
  // Each branch is checked on its own for exactly that reason. Read whole, the
  // condition contained a type check and looked fine; the branch that rendered
  // the button did not have one.
  const EXPORT_ONLY = ["cmsCompleted", "cmsRequired", "transhipment", "vgmReceived"];

  const ungated = [];
  for (const [file, source] of sources) {
    for (const match of source.matchAll(/\{\(([\s\S]{0,400}?)\)\s*\?\s*\(/g)) {
      for (const branch of branches(match[1])) {
        const field = EXPORT_ONLY.find((f) => new RegExp(`\\b${f}\\b`).test(branch));
        if (!field) continue;
        if (/job\.type\s*===|domain\s*===|type:\s*"Export"/.test(branch)) continue;
        ungated.push(`${file}: shows on ${field} without checking the job type`);
      }
    }
  }

  assert.deepEqual(ungated, [],
    "these offer an export-only action on any job, including imports");
});
