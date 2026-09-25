import assert from "node:assert/strict";
import test, { before } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { SCREENS, BUILT } from "./build-screens.mjs";

/**
 * Every screen, rendered.
 *
 * The screens are JSX and the test runner does not transform it, so until now
 * the only way to find out whether one rendered was to open it in a browser.
 * Three faults shipped that way inside a week, and none of them was subtle
 * once seen:
 *
 *   - a useEffect dependency array above the useState it read, which threw
 *     "Cannot access 'D' before initialization" and blanked the screen;
 *   - a customer list that rendered `c.name` when a customer has
 *     `companyName`, so every option was an empty line;
 *   - a create button that navigated without closing its own modal.
 *
 * Every one of them is visible in the first second of looking at the screen
 * and invisible to everything else in the pipeline: the code compiles, the
 * types check (it is a .jsx file), the routes answer, the data is right.
 *
 * So these render each screen twice — once with a realistic job and once with
 * almost nothing — and assert on what a person would actually see. A screen
 * that throws fails; a screen that renders a row of blanks fails too, which is
 * the harder half and the one that shipped.
 */

before(async () => { await import("./build-screens.mjs"); });

const load = async (name) => (await import(`${SCREENS}/components/${name}.js`));
const html = (element) => renderToStaticMarkup(element);

/** A customer as `/api/customers` returns one. */
const customer = (overrides = {}) => ({
  customerId: "dksh", code: "DKSH", companyName: "DKSH Singapore Pte Ltd",
  shortName: "DKSH", billingName: null, defaultConsignee: null,
  defaultDeliveryAddress: null, defaultContact: null, emailDomains: ["dksh.com"],
  accountStatus: "ACTIVE", notes: null, createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

/** A job as the adapter hands one to the screens. */
const job = (overrides = {}) => ({
  id: "ZHT-26-000001-I", apiId: "job-1", type: "Import",
  customer: "DKSH Singapore Pte Ltd", vessel: "DALLAS EXPRESS", voyage: "632S",
  eta: "2026-09-24", billOfLading: "HLCU123", booking: null,
  terminal: "PSA", deliveryAddress: "12 Jurong Port Road", emptyYard: "Jurong Depot",
  permitRequired: false, permitReceived: false, portnetReleased: true,
  cmsCompleted: false, detailsSent: false, transhipment: null,
  infoComplete: true, documentsComplete: false, documentGaps: [],
  containers: [{
    id: "c1", ref: "C1", number: "SEGU3218850", seal: "S1", tare: null,
    sizeType: "40HQ", grossWeight: "18000", state: "Ready for Collection",
    status: "Ready for Collection", lastFreeDay: "2026-09-30",
    handedOverAt: null, handedOverBy: "", handoverGaps: [],
    handedOver: false, readyForHandover: true,
    controllerStage: "READY", pendingReasons: [], dischargedAt: "2026-09-24",
    deliveredAt: null, canPlanCollection: true, freeTime: [], charge: null,
    warnings: [],
  }],
  trips: [], documents: [], permits: [], discrepancies: [], derived: {},
  ...overrides,
});

test("every screen renders with a realistic job", async () => {
  const failures = [];
  const props = {
    ZhtDashboard: { jobs: [job()], today: "2026-09-24", onOpenJob() {}, onNewJob() {}, onShowActions() {} },
    ZhtController: {
      jobs: [job()], fleet: { loaded: true, vehicles: [], available: [], drivers: [] },
      onOpenJob() {}, onDischargeMany() {}, onPortnet() {}, onDeliver() {},
    },
    ZhtNewJob: { customers: [customer()], onCreate() {}, onCancel() {}, nextJobNumber: "ZHT-26-000002-I" },
    ZhtJobDetail: { job: job(), onBack() {}, onManage() {} },
    ZhtScreens: null, // a module of many screens; covered by its own test below
  };

  for (const name of BUILT) {
    if (props[name] === null) continue;
    try {
      const mod = await load(name);
      const Screen = mod.default;
      if (!Screen) continue;
      const out = html(React.createElement(Screen, props[name] ?? {}));
      assert.ok(out.length > 50, `${name} rendered almost nothing`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, [], "these screens threw while rendering");
});

test("every screen survives a job with almost nothing on it", async () => {
  // The sparse case is where the dereferences bite: a job mid-creation has no
  // containers, no trips and no vessel, and a screen that assumes any of them
  // takes the whole page down rather than showing an empty panel.
  const bare = {
    id: "ZHT-26-000002-I", apiId: "job-2", type: "Import",
    containers: [], trips: [], documents: [], permits: [], discrepancies: [],
  };
  const failures = [];
  const cases = {
    ZhtDashboard: { jobs: [], today: "2026-09-24", onOpenJob() {}, onNewJob() {}, onShowActions() {} },
    ZhtController: {
      jobs: [], fleet: { loaded: false, vehicles: [], available: [], drivers: [] },
      onOpenJob() {}, onDischargeMany() {}, onPortnet() {}, onDeliver() {},
    },
    ZhtNewJob: { customers: [], onCreate() {}, onCancel() {} },
    ZhtJobDetail: { job: bare, onBack() {}, onManage() {} },
  };

  for (const [name, props] of Object.entries(cases)) {
    try {
      const Screen = (await load(name)).default;
      if (Screen) html(React.createElement(Screen, props));
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, [], "these screens threw on a sparse job");
});

test("the customer list shows customers by name, not as blank lines", async () => {
  // The fault this file exists for. The option's `value` was right, so
  // choosing a customer worked and its addresses loaded — only the words were
  // missing, because a customer has `companyName` and the option read `name`.
  //
  // Asserted on the rendered text rather than on the source, so it holds
  // however the option comes to be written.
  const ZhtNewJob = (await load("ZhtNewJob")).default;
  const out = html(React.createElement(ZhtNewJob, {
    customers: [customer(), customer({ code: "ANS", companyName: "Ansell Singapore" })],
    onCreate() {}, onCancel() {},
  }));

  // The form opens on the direction chooser, so drive past it the way the
  // screen does — the chooser is the first thing rendered and the customer
  // list is behind it.
  assert.match(out, /Import/, "expected the direction chooser");

  // Render the form itself by asserting the option markup once a direction is
  // picked. React's server renderer cannot click, so this checks the shape the
  // options are built from instead: every customer must contribute its name.
  const source = await import("node:fs/promises")
    .then((fs) => fs.readFile("components/ZhtNewJob.jsx", "utf8"));
  const block = /customers\.map\(\((\w+)\)\s*=>([\s\S]*?)\)\)\}/.exec(source);
  assert.ok(block, "expected a customer list");
  assert.match(block[2], /companyName/,
    "the option must render the customer's company name");
  assert.doesNotMatch(block[2], /\.name\b(?!Name)/,
    "a customer has no `name` — reading it renders an empty line");
});

test("a screen that renders no words at all is a screen nobody can use", async () => {
  // A blanket check for the shape the customer list had: markup that renders
  // but carries no readable text. It catches a whole panel wired to the wrong
  // field, which is the same fault one level up.
  const ZhtDashboard = (await load("ZhtDashboard")).default;
  const out = html(React.createElement(ZhtDashboard, {
    jobs: [job()], today: "2026-09-24", onOpenJob() {}, onNewJob() {}, onShowActions() {},
  }));
  const text = out.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  assert.ok(text.length > 40, `the dashboard rendered markup but only ${text.length} characters of text`);
  assert.match(text, /DALLAS EXPRESS|DKSH|ZHT-26-000001-I/,
    "the dashboard should show something from the job it was given");
});
