import assert from "node:assert/strict";
import test from "node:test";

import { addIsoDays, parseArrivalNoticeText } from "../lib/arrival-notice-parser.mjs";

const arrivalNotice = `
Arrival Notice
Date of Issue: 26/AUG/2026
Estimated Date of Arrival
31/AUG/2026
Bill of Lading Number
HLCUSZX2607BSUB0 (SW)
Booking Number
34416855
Main Vessel
DALLAS EXPRESS
V. 632S
Oncarrying Vessel
Port of Loading
NANSHA
Port of Discharge
SINGAPORE
Discharging Terminal
PSA PASIR PANJANG TERMINAL
Haulage
MERCHANT'S HAULAGE
Notify
DKSH SINGAPORE PTE LTD
47 JALAN BUROH
SINGAPORE
HL Contact Information
Shipper Consignee
ANSELL (SHANGHAI) HEALTHCARE CO., LTD
SHANGHAI CHINA
DKSH SINGAPORE PTE LTD
47, JALAN BUROH SINGAPORE 619491
SINGAPORE
REFERENCE: 260703083805254
Containers & Goods
SEGU 3218850
Container Type: 20' GENERAL PURPOSE
Seal No(s): HLK6603170
Packages: 300 CASE (CS) 990.0 KGM 20.400 M3
Description: INDUSTRIAL SAFETY GLOVES
Marks & Numbers: N/M
Free demurrage period 3 calendar days
Free detention period - 4 days
`;

test("extracts an arrival notice into job-ready facts", () => {
  const result = parseArrivalNoticeText(arrivalNotice);

  assert.equal(result.values.issueDate, "2026-08-26");
  assert.equal(result.values.eta, "2026-08-31");
  assert.equal(result.values.billOfLading, "HLCUSZX2607BSUB0");
  assert.equal(result.values.bookingNumber, "34416855");
  assert.equal(result.values.vessel, "DALLAS EXPRESS");
  assert.equal(result.values.voyage, "632S");
  assert.equal(result.values.containerNumber, "SEGU3218850");
  assert.equal(result.values.sealNumber, "HLK6603170");
  assert.equal(result.containers.length, 1);
  assert.equal(result.containers[0].ref, "C1");
  assert.equal(result.values.packageCount, "300");
  assert.equal(result.values.grossWeightKg, "990.0");
  assert.equal(result.values.volumeM3, "20.400");
  assert.match(result.values.shipper, /ANSELL \(SHANGHAI\) HEALTHCARE CO\., LTD/);
  assert.match(result.values.consignee, /DKSH SINGAPORE PTE LTD/);
  assert.deepEqual(result.requiredMissing, []);
  assert.equal(result.planning.demurrageLastFreeDay, "2026-09-03");
  assert.equal(result.planning.detentionLastFreeDay, "2026-09-07");
  assert.equal(result.planning.provisional, true);
});

test("extracts every container on a multi-container arrival notice", () => {
  const secondContainer = `
OOLU 8841250
Container Type: 40' HIGH CUBE
Seal No(s): HLK7788990
Packages: 420 CARTON (CT) 12450.0 KGM 48.200 M3
Description: INDUSTRIAL COMPONENTS
Marks & Numbers: N/M
`;
  const multiContainerNotice = arrivalNotice.replace(
    "Free demurrage period 3 calendar days",
    `${secondContainer}\nFree demurrage period 3 calendar days`,
  );
  const result = parseArrivalNoticeText(multiContainerNotice);

  assert.equal(result.containers.length, 2);
  assert.deepEqual(result.containers.map((container) => container.number), ["SEGU3218850", "OOLU8841250"]);
  assert.equal(result.containers[1].ref, "C2");
  assert.equal(result.containers[1].type, "40' HIGH CUBE");
  assert.equal(result.containers[1].seal, "HLK7788990");
  assert.equal(result.containers[1].grossWeightKg, "12450.0");
  assert.deepEqual(result.requiredMissing, []);
});

test("marks review-sensitive fields and rejects unrelated PDFs", () => {
  const result = parseArrivalNoticeText(arrivalNotice);

  assert.equal(result.confidence.billOfLading, "high");
  assert.equal(result.confidence.consignee, "review");
  assert.throws(
    () => parseArrivalNoticeText("Commercial invoice\nInvoice total USD 100"),
    /does not look like an arrival notice/i,
  );
});

test("adds planning days without local timezone drift", () => {
  assert.equal(addIsoDays("2026-08-31", 3), "2026-09-03");
  assert.equal(addIsoDays("", 3), "");
});
