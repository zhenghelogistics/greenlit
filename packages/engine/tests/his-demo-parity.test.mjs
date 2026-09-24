/**
 * Our rules, run against his, on the same inputs.
 *
 * The demo is the specification, and a specification written in JavaScript can
 * be executed rather than read. So it is: his script blocks are pulled out of
 * the HTML in document order, evaluated under a DOM thin enough to let the
 * pure logic run, and his answers compared to ours across a thousand-odd
 * cases — a year of ETAs against every plausible allowance, every permit
 * expiry against its vessel, every combination of the four facts behind the
 * controller's board.
 *
 * It found one disagreement, and his was the better behaviour: he counted a
 * last free day from a DD/MM/YYYY date and we returned null for one. Null
 * means no deadline at all, silently, which is worse than a wrong date because
 * nothing looks broken. Ours takes both shapes now.
 *
 * It also found two script blocks with unbalanced brackets — an unclosed
 * `forEach(` and an unclosed `Array.from(` — which a browser refuses whole.
 * That is worth knowing for one reason only: the behaviour those blocks
 * describe has never actually run, so the demo cannot be taken as showing it.
 * The intent still stands and is worth building; what cannot be assumed is
 * that anybody has seen it work.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require("../../../scripts/his/run-his-demo.cjs");
const his = globalThis;

const ours = await import("../src/free-time.ts");
const board = await import("../src/controller-board.ts");
const permits = await import("../src/permits.ts");

let checked = 0, differ = [];
const cmp = (label, a, b) => {
  checked++;
  if (JSON.stringify(a) !== JSON.stringify(b)) differ.push(`${label}\n     his=${JSON.stringify(a)}  ours=${JSON.stringify(b)}`);
};

// ---- 1. last free day, across a year of dates and every plausible allowance
for (let d = 1; d <= 28; d++) {
  for (const m of [1, 2, 6, 9, 12]) {
    for (const days of [1, 3, 5, 7, 10, 14, 21, 30]) {
      const eta = `2026-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      cmp(`LFD ${eta} + ${days}`, his.addDaysInclusive(eta, days), ours.lastFreeDayFrom(eta, days));
    }
  }
}
// leap year, month ends, year end
for (const [eta, days] of [["2028-02-26",5],["2026-12-28",7],["2026-01-31",1],["2026-10-31",30]]) {
  cmp(`LFD edge ${eta}+${days}`, his.addDaysInclusive(eta, days), ours.lastFreeDayFrom(eta, days));
}
// refusals
for (const [eta, days] of [["",7],["2026-09-23",0],["2026-09-23",-3],["23/09/2026",7]]) {
  cmp(`LFD refuse ${eta}|${days}`, his.addDaysInclusive(eta, days) || null, ours.lastFreeDayFrom(eta || null, days) ?? null);
}

// ---- 2. free-time classification
for (const n of [1,5,9,10,11,14,30,0,null]) {
  const hisTerm = his.freeTimeTerm(n);
  const oursTerm = { SHORT:"Short Term", THRESHOLD:"10-Day Threshold", LONG:"Long Term", UNKNOWN:"Not classified" }[ours.freeTimeTerm(n)];
  cmp(`term ${n}`, hisTerm, oursTerm);
}

// ---- 3. permit expiry against the ETA
for (const [exp, eta] of [["2026-10-30","2026-09-23"],["2026-09-23","2026-09-23"],
                          ["2026-09-22","2026-09-23"],["2026-09-24","2026-09-23"]]) {
  const hisOk = his.permitExpiryAfterEta(exp, eta);
  const oursOk = permits.checkPermit(
    { permitId:"p", permitNumber:"IG6I789494H", expiryDate:exp, permitVesselVoyage:"X 1S", fileName:null, linkedContainerIds:[] },
    { vesselName:"X", voyageNumber:"1S", eta }
  ).expiry === "VALID";
  cmp(`permit expiry ${exp} vs ETA ${eta}`, hisOk, oursOk);
}

// ---- 4. vessel/voyage matching
for (const [a, b] of [["CALLAO BRIDGE / 256S","CALLAO BRIDGE 256S"],
                      ["callao bridge/256s","CALLAO BRIDGE / 256S"],
                      ["CALLAO BRIDGE / 256S","CALLAO BRIDGE / 257S"],
                      ["EVER ACE / 0321W","EVERACE0321W"]]) {
  const hisSame = his.normalizeVesselVoyage(a).toUpperCase().replace(/[^A-Z0-9]/g,"")
                === his.normalizeVesselVoyage(b).toUpperCase().replace(/[^A-Z0-9]/g,"");
  const oursSame = permits.checkPermit(
    { permitId:"p", permitNumber:null, expiryDate:null, permitVesselVoyage:a, fileName:null, linkedContainerIds:[] },
    { vesselName:b, voyageNumber:null, eta:null }
  ).vessel === "VALID";
  cmp(`sailing "${a}" vs "${b}"`, hisSame, oursSame);
}

// ---- 5. the controller's four piles
const cases = [
  {portnet:false, discharged:false, delivered:false, empty:false},
  {portnet:true,  discharged:false, delivered:false, empty:false},
  {portnet:false, discharged:true,  delivered:false, empty:false},
  {portnet:true,  discharged:true,  delivered:false, empty:false},
  {portnet:true,  discharged:true,  delivered:true,  empty:false},
  {portnet:true,  discharged:true,  delivered:true,  empty:true},
];
for (const c of cases) {
  const hisC = { portnet:c.portnet, discharged:c.discharged,
    delivered:c.delivered, status:c.empty?"Empty Ready":c.delivered?"Delivered":"Portnet Pending",
    emptyReady:c.empty, isEmpty:c.empty };
  const hisStage = his.v12116Stage(hisC);
  const oursStage = board.controllerStage({
    portnetReleased:c.portnet,
    dischargedAt:c.discharged?"2026-09-24T02:00:00Z":null,
    deliveredAt:c.delivered?"2026-09-25T09:00:00Z":null,
    emptyReadyAt:c.empty?"2026-09-27T09:00:00Z":null,
  }).toLowerCase();
  cmp(`stage ${JSON.stringify(c)}`, hisStage, oursStage);
}

test(`our rules agree with the demo across ${checked} cases`, () => {
  assert.deepEqual(differ, [],
    'the demo is the specification; a disagreement is one of us being wrong');
});
