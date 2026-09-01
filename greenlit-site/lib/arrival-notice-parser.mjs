const MONTHS = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

export const REQUIRED_JOB_FIELDS = [
  "eta",
  "billOfLading",
  "vessel",
  "portOfDischarge",
  "terminal",
  "consignee",
  "containerNumber",
];

export const MAX_CONTAINERS_PER_JOB = 20;

function clean(value = "") {
  return value.replace(/\s+/g, " ").replace(/\s+([,.:])/g, "$1").trim();
}

function firstMatch(text, expression, group = 1) {
  const match = text.match(expression);
  return clean(match?.[group] || "");
}

function carrierDateToIso(value) {
  const match = value.match(/^(\d{1,2})\/([A-Z]{3})\/(\d{4})$/i);
  if (!match) return "";
  const month = MONTHS[match[2].toUpperCase()];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : "";
}

function splitParties(text) {
  const block = text.match(/Shipper\s+Consignee\s+([\s\S]+?)\s+REFERENCE:/i)?.[1]?.trim() || "";
  if (!block) return { shipper: "", consignee: "" };
  const lines = block.split(/\n+/).map(clean).filter(Boolean);
  const consigneeIndex = lines.findIndex((line, index) => index > 0 && /\bPTE\.?\s*LTD\b|\bPRIVATE LIMITED\b|\bLLP\b|\bLLC\b/i.test(line));
  if (consigneeIndex < 1) return { shipper: block, consignee: "" };
  return {
    shipper: clean(lines.slice(0, consigneeIndex).join(" · ")),
    consignee: clean(lines.slice(consigneeIndex).join(" · ")),
  };
}

function confidenceFor(value, level = "high") {
  return value ? level : "missing";
}

function parseContainers(text) {
  const section = text.match(/Containers\s*&\s*Goods\s+([\s\S]+?)(?=Digital Self-Service Tools|Important Notice|Free demurrage period|Free detention period|$)/i)?.[1] || "";
  const expression = /([A-Z]{4})\s*(\d{7})\s+Container Type:\s*([\s\S]+?)\s+Seal No\(s\):\s*([^\n]+)([\s\S]*?)(?=(?:[A-Z]{4})\s*\d{7}\s+Container Type:|$)/gi;
  const containers = [];

  for (const match of section.matchAll(expression)) {
    const cargoBlock = match[5] || "";
    const packagesMatch = cargoBlock.match(/Packages:\s*([\d,]+)\s+([\s\S]+?)\s+([\d,.]+)\s*KGM\s+([\d,.]+)\s*M3/i);
    containers.push({
      id: `container-${containers.length + 1}`,
      ref: `C${containers.length + 1}`,
      number: `${match[1].toUpperCase()}${match[2]}`,
      type: clean(match[3]),
      seal: clean(match[4]),
      packageCount: clean(packagesMatch?.[1] || ""),
      packageType: clean(packagesMatch?.[2] || ""),
      grossWeightKg: clean(packagesMatch?.[3] || ""),
      volumeM3: clean(packagesMatch?.[4] || ""),
      cargoDescription: firstMatch(cargoBlock, /Description:\s*([\s\S]+?)\s+Marks\s*&\s*Numbers:/i),
    });
  }

  if (containers.length > MAX_CONTAINERS_PER_JOB) {
    throw new Error(`This arrival notice contains ${containers.length} containers. Greenlit supports up to ${MAX_CONTAINERS_PER_JOB} containers per job in this demo.`);
  }
  return containers;
}

export function addIsoDays(isoDate, days) {
  if (!isoDate || !Number.isFinite(Number(days))) return "";
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

export function parseArrivalNoticeText(rawText) {
  const text = rawText
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!/Arrival Notice/i.test(text) || !/Estimated Date of Arrival/i.test(text)) {
    throw new Error("This PDF does not look like an arrival notice. Try a carrier arrival notice with selectable text.");
  }

  const parties = splitParties(text);
  const issueDateLabel = firstMatch(text, /Date of Issue:\s*(\d{1,2}\/[A-Z]{3}\/\d{4})/i);
  const etaLabel = firstMatch(text, /Estimated Date of Arrival\s+(\d{1,2}\/[A-Z]{3}\/\d{4})/i);
  const vesselMatch = text.match(/Main Vessel\s+([\s\S]+?)\s+V\.\s*([A-Z0-9-]+)\s+Oncarrying Vessel/i);
  const containers = parseContainers(text);
  const firstContainer = containers[0] || {};

  const values = {
    documentType: "Arrival Notice",
    carrier: /Hapag-Lloyd/i.test(text) ? "Hapag-Lloyd" : "Carrier not identified",
    issueDate: carrierDateToIso(issueDateLabel),
    eta: carrierDateToIso(etaLabel),
    billOfLading: firstMatch(text, /Bill of Lading Number\s+([A-Z0-9-]+)/i),
    bookingNumber: firstMatch(text, /Booking Number\s+([A-Z0-9-]+)/i),
    vessel: clean(vesselMatch?.[1] || ""),
    voyage: clean(vesselMatch?.[2] || ""),
    portOfLoading: firstMatch(text, /Port of Loading\s+([\s\S]+?)\s+Port of Discharge/i),
    portOfDischarge: firstMatch(text, /Port of Discharge\s+([\s\S]+?)\s+Discharging Terminal/i),
    terminal: firstMatch(text, /Discharging Terminal\s+([\s\S]+?)\s+Haulage/i),
    haulage: firstMatch(text, /Haulage\s+([\s\S]+?)\s+Notify/i),
    shipper: parties.shipper,
    consignee: parties.consignee,
    notify: firstMatch(text, /Notify\s+([\s\S]+?)\s+HL Contact Information/i),
    reference: firstMatch(text, /REFERENCE:\s*([A-Z0-9-]+)/i),
    containerNumber: firstContainer.number || "",
    containerType: firstContainer.type || "",
    sealNumber: firstContainer.seal || "",
    packageCount: firstContainer.packageCount || "",
    packageType: firstContainer.packageType || "",
    grossWeightKg: firstContainer.grossWeightKg || "",
    volumeM3: firstContainer.volumeM3 || "",
    cargoDescription: firstContainer.cargoDescription || "",
    demurrageFreeDays: firstMatch(text, /Free demurrage period\s+(\d+)\s+calendar days/i),
    detentionFreeDays: firstMatch(text, /Free detention\s+period\s*-?\s*(\d+)\s+days/i),
  };

  values.deliveryAddress = values.consignee;

  const mediumConfidence = new Set(["shipper", "consignee", "notify", "deliveryAddress", "terminal", "cargoDescription"]);
  const confidence = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, confidenceFor(value, mediumConfidence.has(key) ? "review" : "high")]),
  );

  const containerKeys = new Set(["containerNumber", "containerType", "sealNumber", "packageCount", "packageType", "grossWeightKg", "volumeM3", "cargoDescription"]);
  const shipmentFieldCount = Object.entries(values).filter(([key, value]) => value && !containerKeys.has(key)).length;
  const containerFieldCount = containers.reduce((count, container) => count + [container.number, container.type, container.seal, container.packageCount, container.packageType, container.grossWeightKg, container.volumeM3, container.cargoDescription].filter(Boolean).length, 0);
  const extractedCount = shipmentFieldCount + containerFieldCount;
  const requiredMissing = REQUIRED_JOB_FIELDS.filter((key) => !values[key]);

  return {
    values,
    containers,
    confidence,
    extractedCount,
    requiredMissing,
    planning: {
      demurrageLastFreeDay: addIsoDays(values.eta, Number(values.demurrageFreeDays || 3)),
      detentionLastFreeDay: addIsoDays(values.eta, Number(values.demurrageFreeDays || 3) + Number(values.detentionFreeDays || 4)),
      provisional: true,
    },
  };
}
