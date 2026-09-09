/**
 * The extraction speaks the carrier's vocabulary; the review screen speaks the
 * operator's. This is the join between them.
 *
 * Keeping it in one named table rather than inline in the upload handler means
 * a field the model learns to read cannot silently fail to appear on screen —
 * the mapping is the thing to check, and it is testable.
 */
export const API_TO_FORM = {
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
 * Container-level fields. These describe the box, not the shipment, so they
 * belong on the container row rather than the job form — a job can carry
 * several containers with different seals and weights.
 */
export const CONTAINER_FIELDS = {
  containerNumber: "number",
  containerSizeType: "type",
  sealNumber: "seal",
  grossWeight: "grossWeight",
  packageCount: "packageCount",
  packageType: "packageType",
};

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

  // Container-level values are one row of the container table, not form
  // fields. One row is always produced: a job with no container cannot
  // progress, so there is somewhere to type the number even when the document
  // did not carry one.
  const row = { id: "container-1", ref: "C1", number: "", type: "", seal: "",
                grossWeight: "", packageCount: "", packageType: "" };
  for (const [apiKey, rowKey] of Object.entries(CONTAINER_FIELDS)) {
    const entry = response.fields?.[apiKey];
    if (entry?.value != null) row[rowKey] = String(entry.value);
  }
  const containers = [row];

  return {
    values,
    confidence,
    containers,
    fileName: response.fileName,
    pages: response.pages ?? 1,
    model: response.model,
    strategy: response.strategy,
  };
}
