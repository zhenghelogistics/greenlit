const rows = [];
const sizes = ["40 HQ", "20 GP", "40 GP"];
for (let i = 1; i <= 38; i++) {
  rows.push(`${String(i).padStart(2,"0")}  MSKU${String(1000000+i*37).padStart(7,"0")}  ${sizes[i%3]}  SEAL${880000+i*13}  ${21000+i*137}.00 KGS  ${100+i} CARTON`);
}
export const NOTICE = `
MAERSK SINGAPORE PTE LTD — ARRIVAL NOTICE
To: ACME LOGISTICS PTE LTD, 21 Tuas South Ave 6, Singapore 637311
B/L Number: MAEU258774311
Vessel: MAERSK SENTOSA    Voyage: 442W
Port of Loading: NINGBO   Port of Discharge: SINGAPORE
ETA: 2026-09-28
Free demurrage period: 5 calendar days from discharge
Free detention period: 7 calendar days
Empty return depot: Chuan Li Container Pte Ltd, 12A Refinery Road
Demurrage rate after free period: SGD 85.00 per container per day

CONTAINER MANIFEST (38 units)
NO  CONTAINER      SIZE   SEAL           GROSS WEIGHT   PACKAGES
${rows.join("\n")}
Total: 38 containers
`;
