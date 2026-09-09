/**
 * The extraction speaks the carrier's vocabulary; the review screen speaks the
 * operator's. This is the join between them.
 *
 * Keeping it in one named table rather than inline in the upload handler means
 * a field the model learns to read cannot silently fail to appear on screen —
 * the mapping is the thing to check, and it is testable.
 */
export const API_TO_FORM = {
  // Export. An export job is a booking rather than an arrival: the deadline is
  // the vessel closing, and the box is collected empty before it is anything.
  vesselClosingAt: "vesselClosingAt",
  etd: "etd",
  emptyCollectionYard: "emptyCollectionYard",
  stuffingLocation: "stuffingLocation",
  exportClearanceReference: "exportClearanceReference",
  containerQuantity: "containerQuantity",
  blNumber: "billOfLading",
  houseBlNumber: "houseBillOfLading",
  bookingReference: "bookingNumber",
  vesselName: "vessel",
  notifyParty: "notify",
  carrierReference: "reference",
  // Same name on both sides, listed so the table is the whole story.
  eta: "eta",
  voyage: "voyage",
  carrier: "carrier",
  portOfLoading: "portOfLoading",
  portOfDischarge: "portOfDischarge",
  terminal: "terminal",
  shipper: "shipper",
  consignee: "consignee",
  deliveryAddress: "deliveryAddress",
  emptyReturnYard: "emptyReturnYard",
  freeTimeModel: "freeTimeModel",
  combinedFreeDays: "combinedFreeDays",
  freeTimeRemarks: "freeTimeRemarks",
  demurrageFreeDays: "demurrageFreeDays",
  detentionFreeDays: "detentionFreeDays",
  permitNumber: "permitNumber",
  vgm: "vgm",
};

/** Below this, a field is shown as needing a look rather than as read. */
export const REVIEW_BELOW = 0.85;

/**
 * Turn an /api/extract response into what the review screen renders.
 *
 * Confidence becomes one of "high" or "review" rather than a number: the
 * operator's question is "must I check this?", and a percentage invites them
 * to weigh a score instead of answering it.
 */
export function toIntakeResult(response) {
  const values = {};
  const confidence = {};

  for (const [apiKey, entry] of Object.entries(response.fields ?? {})) {
    const formKey = API_TO_FORM[apiKey];
    if (!formKey || entry?.value == null) continue;
    values[formKey] = String(entry.value);
    confidence[formKey] = entry.confidence >= REVIEW_BELOW ? "high" : "review";
  }

  // Every container the document listed, each keeping its own seal, size and
  // weight. Reading them as separate fields lost four of the five on a real
  // notice and paired the survivor with another row's seal.
  //
  // One empty row when the document listed none: a job with no container
  // cannot progress, so there has to be somewhere to type the number.
  const rows = (response.containers ?? []).map((c, index) => ({
    id: `container-${index + 1}`,
    ref: `C${index + 1}`,
    number: c.containerNumber ?? "",
    type: c.sizeType ?? "",
    seal: c.sealNumber ?? "",
    grossWeight: c.grossWeight ?? "",
    packageCount: c.packageCount ?? "",
    packageType: c.packageType ?? "",
    confidence: c.confidence >= REVIEW_BELOW ? "high" : "review",
  }));
  const containers = rows.length ? rows : [{
    id: "container-1", ref: "C1", number: "", type: "", seal: "",
    grossWeight: "", packageCount: "", packageType: "",
  }];

  return {
    values,
    confidence,
    containers,
    // What the document is about, so intake opens the job in the right
    // direction. Null when the document did not say — better than a guess,
    // because a job opened the wrong way is worked against the wrong deadline
    // entirely: free time for an import, vessel closing for an export.
    domain: response.fields?.domain?.value ?? null,
    documentType: response.fields?.documentType?.value ?? null,
    fileName: response.fileName,
    pages: response.pages ?? 1,
    model: response.model,
    strategy: response.strategy,
  };
}
