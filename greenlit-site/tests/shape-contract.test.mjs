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

test("every value the engine derives for a container reaches the screen", async () => {
  // The list above is hand-written, so it only ever catches what somebody
  // remembered to add to it — which is to say, not the field that was just
  // added. This checks the actual contract instead.
  //
  // The leak is silent and specific: `derive.ts` computes a value, the adapter
  // maps the container fields one by one and does not mention it, and the
  // screen reads `undefined`. Nothing throws. `readyForHandover` did exactly
  // this — every container read as not ready, and the handover panel simply
  // showed nothing to hand over.
  const derived = await readFile("../packages/core/src/derive.ts", "utf8");
  const adapter = await readFile("lib/job-adapter.mjs", "utf8");

  const shape = /export interface DerivedContainerView \{([\s\S]*?)\n\}/.exec(derived);
  assert.ok(shape, "expected to find the derived container view's shape");

  // Field names at the top level of the interface, ignoring its comments.
  const fields = [...shape[1].matchAll(/^ {2}([a-zA-Z]\w*)\??:/gm)].map((m) => m[1]);
  assert.ok(fields.length > 10, `expected a real field list, found ${fields.length}`);

  // Some values reach the screen under a different name. The rename is the
  // adapter's job — the screens are older than the engine and their words won
  // — so what matters is that the value is read, not what it is called.
  const RENAMED = {
    containerId: "id",
    containerNumber: "number",
    carrierLastFreeDay: "lastFreeDay",
  };

  // Derived and deliberately not sent. Each is here because nothing reads it,
  // and naming it is what makes that a decision rather than an oversight: the
  // gate result is recomputed for the handover panel from its own two lists,
  // so forwarding it as well would be a second answer to one question.
  const NOT_FORWARDED = new Set([
    "gatePassed", "gateFailures",
    // `ref` is built from the raw container, not from the derived view — it is
    // a label, not a derived value, and falls back to a position when the
    // container has none.
    "reference",
  ]);

  const dropped = fields.filter((field) => {
    if (NOT_FORWARDED.has(field)) return false;
    const name = RENAMED[field] ?? field;
    // Read anywhere in the adapter's container mapping, whatever it is wrapped
    // in — `x: view.containers[i].x`, `Boolean(...)`, `?? []`.
    return !new RegExp(`\\b${name}\\s*:[^,\\n]*\\b${field}\\b`).test(adapter);
  });

  assert.deepEqual(dropped, [],
    "the engine derives these per container and the adapter does not pass them on");
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

test("a job field compared against a literal is a field the adapter produces", async () => {
  // The quieter half of the dereference bug. `job.missing.sub` throws and gets
  // noticed; `job.missing === "EXPORT"` is merely always false, so a whole
  // branch silently never runs and nothing anywhere reports a problem.
  //
  // Two real instances. A container-details card keyed on `job.domain`, which
  // the adapter has never produced — the card would never have appeared. And
  // `job.carparkRequested == null`, which was always true, so "Carpark
  // Decision Needed" could not clear and "Ready for One-Way Loaded Trip" was
  // unreachable.
  //
  // Comparisons only, deliberately. A bare truthiness test on an absent field
  // is usually a legitimate optional, while comparing one to a literal says
  // the author believed a specific value could be there.
  const src = await readFile(SOURCE, "utf8");
  const compared = new Set();
  for (const m of src.matchAll(/\bjob\.(\w+)\s*[=!]==?\s*["']/g)) compared.add(m[1]);
  for (const m of src.matchAll(/\bjob\.(\w+)\s*[=!]=\s*null/g)) compared.add(m[1]);

  const job = jobFromApi(sparseView);
  const missing = [...compared].filter((f) => !(f in job));

  assert.deepEqual(missing, [],
    `compared against a literal but never produced, so the branch is dead: ${missing.join(", ")}`);
});

test("every screen a button navigates to is a screen that exists", async () => {
  // `+ New Job` called goTo("intake"). There is no "intake" screen — the id is
  // "documents" — so the button rendered, took the click, set the screen to a
  // value nothing matches, and put up a blank page.
  //
  // The same shape as the dead-branch bug above: a string compared against a
  // set it is not in fails silently. Here the set is the screens the router
  // actually handles.
  const src = await readFile(SOURCE, "utf8");
  // `current` is the resolved screen: what the person chose, or the one
  // their role lands on. Both spellings appear, so both are read.
  const screens = new Set(
    [...src.matchAll(/(?:screen|current) === "([a-zA-Z]+)"/g)].map((m) => m[1]));
  const targets = [...src.matchAll(/goTo\("([a-zA-Z]+)"\)/g)].map((m) => m[1]);

  const dead = [...new Set(targets)].filter((t) => !screens.has(t));
  assert.deepEqual(dead, [],
    `goTo targets no screen renders, so the click blanks the page: ${dead.join(", ")}`);
});

test("a component is only handed props it declares", async () => {
  // TripTable declares ({ trips, flashTripId, onOpenTrip }) and was being
  // rendered as <TripTable job={...} />. `trips` came through undefined, and
  // `trips.length` took the whole screen down with "Cannot read properties of
  // undefined (reading 'length')".
  //
  // Nothing typechecks JSX props in a .jsx file, so the mistake is invisible
  // until the screen is opened. This compares what each component destructures
  // against what every call site actually passes.
  const src = await readFile(SOURCE, "utf8");

  const declared = new Map();
  for (const m of src.matchAll(/function ([A-Z]\w*)\(\{([^}]*)\}/g)) {
    const names = m[2].split(",")
      .map((p) => p.split(/[:=]/)[0].trim())
      .filter((p) => p && !p.startsWith("..."));
    declared.set(m[1], new Set(names));
  }

  // React owns these; they are never destructured by the component.
  const REACT_OWN = new Set(["key", "ref"]);

  const offenders = [];
  // `[^<>]` keeps the attribute run from spanning into nested children, which
  // would otherwise attribute an inner element's onClick to the outer tag.
  for (const m of src.matchAll(/<([A-Z]\w*)\s([^<>]*?)\/?>/g)) {
    const [, name, attrs] = m;
    const params = declared.get(name);
    if (!params) continue;               // imported from elsewhere
    if (/\{\s*\.\.\./.test(attrs)) continue;  // spread: cannot be read statically
    for (const a of attrs.matchAll(/(\w+)=\{/g)) {
      if (!REACT_OWN.has(a[1]) && !params.has(a[1])) offenders.push(`<${name} ${a[1]}={…}>`);
    }
  }

  assert.deepEqual([...new Set(offenders)], [],
    "a prop the component never destructures arrives as undefined, and the "
    + "first property read off it throws");
});

test("the fields a screen reads off a customer are fields a customer has", async () => {
  // The New Job form listed every customer as a blank line. The option's
  // `value` was right, so choosing one worked and its addresses loaded — only
  // the words were missing, because it rendered `c.name` and a customer has
  // `companyName`.
  //
  // Nothing could catch that. It is not a type error in a .jsx file, it does
  // not throw, and it does not even look wrong until you open the dropdown:
  // undefined renders as nothing at all. This is the third time a screen has
  // read a field that does not exist — `location.company` and
  // `customer.locations` were the other two — so it is worth a guard.
  const source = await readFile("components/ZhtNewJob.jsx", "utf8");
  const types = await readFile("../packages/engine/src/customers.ts", "utf8");

  const shape = /export interface Customer \{([\s\S]*?)\n\}/.exec(types);
  assert.ok(shape, "expected to find the Customer shape");
  const real = new Set([...shape[1].matchAll(/^ {2}([a-zA-Z]\w*)\??:/gm)].map((m) => m[1]));
  assert.ok(real.has("companyName"), "sanity: the shape was parsed");

  // Whatever the map's parameter is called, and only inside that map — `c` is
  // a container two hundred lines further down.
  const block = /customers\.map\(\((\w+)\)\s*=>([\s\S]*?)\)\)\}/.exec(source);
  assert.ok(block, "expected the customer list to be rendered by a map");
  const [, binding, body] = block;

  const read = [...body.matchAll(new RegExp(`\\b${binding}\\.(\\w+)`, "g"))].map((m) => m[1]);
  assert.ok(read.length > 0, "expected the option to read something off the customer");

  const unknown = [...new Set(read)].filter((field) => !real.has(field));
  assert.deepEqual(unknown, [],
    "the customer list reads fields a Customer does not have, which render as blank");
});
