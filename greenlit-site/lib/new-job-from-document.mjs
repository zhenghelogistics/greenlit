/**
 * The read document, on the New Job form.
 *
 * This is a join and nothing else. Reading the document, scoring how clearly
 * each value came off the page, keeping each container's own row together and
 * deciding what counts as needing a second look all happen in
 * `toIntakeResult`, which is the intake module and is already tested. Doing
 * any of it a second time here would mean two answers to the same question and
 * one of them going stale.
 *
 * What is left is genuinely local: the intake module speaks the review
 * screen's vocabulary and this form speaks its own, and an ETA that arrives as
 * one string has to land in two controls.
 */
import { matchCarrier } from "@greenlit/engine";
import { toIntakeResult } from "./intake-fields.mjs";

/**
 * Intake's name for a value, and this form's name for the same value.
 *
 * An allowlist as well as a translation: the reader finds ports, terminals,
 * consignees and package counts that this form has nowhere to put, and a value
 * written into a job with nowhere on screen to show it is one nobody can check.
 *
 * `deliveryAddress` is deliberately absent and always will be. The notice
 * prints one as free text, the customer master holds the real ones, and
 * matching "12 Jurong Port Rd" to a saved "12 Jurong Port Road" is a judgement
 * with a delivery on the end of it. It comes back separately, to be shown
 * beside the picker.
 */
const INTAKE_TO_JOB = {
  vessel: "vesselName",
  voyage: "voyageNumber",
  carrier: "carrier",
  billOfLading: "blNumber",
  houseBillOfLading: "houseBlNumber",
  bookingNumber: "bookingReference",
  shipper: "shipper",
  emptyCollectionYard: "emptyCollectionYard",
  exportClearanceReference: "exportClearanceReference",
  permitNumber: "permitNumber",
  permitExpiryDate: "permitExpiryDate",
  permitVesselVoyage: "permitVesselVoyage",
};

/** The blank container row, which is also what "nothing typed yet" looks like. */
export const EMPTY_ROW = {
  containerNumber: "", sizeType: "", grossWeight: "", deliveryDate: "", deliveryTime: "",
  emptyReturnYard: "", freeTimeModel: "COMBINED", combinedFreeDays: "",
  demurrageFreeDays: "", detentionFreeDays: "",
  deliveryCompany: "", deliveryAddress: "",
  heavyDuty: false, rated32_5: false, triAxle: false,
};

/**
 * Read an /api/extract response into a patch for the form.
 *
 * Returns what to write and writes nothing, so the whole of it can be asserted
 * against a response without rendering anything — which is the fault this was
 * pulled out of the component to fix.
 *
 * @param read     one document from /api/extract
 * @param existing the container rows already on the form, so typing is not lost
 */
export function jobFromDocument(read, existing = []) {
  const intake = toIntakeResult(read ?? {});
  const { values, confidence } = intake;

  const job = {};
  const filled = {};
  /** Intake has already reduced the score to the only question worth asking. */
  const mark = (key, from) => { filled[key] = confidence[from] === "high" ? "read" : "review"; };

  for (const [from, key] of Object.entries(INTAKE_TO_JOB)) {
    if (!values[from]) continue;
    // The carrier is the one field where what the document prints and what
    // this form holds are different things. A notice says "ORIENT OVERSEAS
    // CONTAINER LINE" and the form holds OR, because that is what operations
    // say and what fits in a column.
    //
    // A name that matches nothing is left out rather than written in as
    // itself: the field is a list of known carriers, and a value that is not
    // on it would sit there looking chosen while selecting nothing.
    if (key === "carrier") {
      const carrier = matchCarrier(values[from]);
      if (carrier) { job.carrier = carrier.code; mark("carrier", from); }
      continue;
    }
    job[key] = values[from];
    mark(key, from);
  }

  // An ETA arrives as one string and the form asks for it in two controls. The
  // time is kept where the document gave one: an arrival at 1700 and one at
  // midnight are different days' work.
  if (values.eta) {
    const [date, time] = String(values.eta).split(/[ T]/);
    job.etaDate = date;
    mark("etaDate", "eta");
    if (time) job.etaTime = time.slice(0, 5);
  }

  // A document carrying a permit number is a job that needs a permit. This only
  // ever turns the flag on: a permit in hand is evidence, and a customer record
  // that says nothing is not evidence of the opposite.
  if (values.permitNumber) job.permitRequired = true;

  // Containers, as this form's rows. Intake always returns at least one row so
  // its own screen has somewhere to type; an empty one here means the document
  // listed none, which is not a reason to overwrite anything.
  const read_rows = (intake.containers ?? []).filter((c) => c.number || c.type);
  const untouched = existing.length === 0
    || (existing.length === 1 && !existing[0]?.containerNumber && !existing[0]?.sizeType);

  const rows = read_rows.length && untouched
    ? read_rows.map((c) => ({
        ...EMPTY_ROW,
        containerNumber: String(c.number ?? "").toUpperCase(),
        sizeType: String(c.type ?? "").toUpperCase(),
        // Deliberately not taken. Operations enter the weight themselves once
        // Portnet has been updated, so a figure read off the notice is a
        // number somebody has to check against the one they are about to type
        // — which is work, not help.
        grossWeight: "",
        emptyReturnYard: values.emptyReturnYard ?? "",
        // SPLIT and COMBINED are not interchangeable, and the reader is told to
        // omit the shape rather than guess it. Absent means the form's own
        // default, not a reading of the document.
        freeTimeModel: values.freeTimeModel === "SPLIT" ? "SPLIT" : "COMBINED",
        combinedFreeDays: values.combinedFreeDays ?? "",
        demurrageFreeDays: values.demurrageFreeDays ?? "",
        detentionFreeDays: values.detentionFreeDays ?? "",
      }))
    : null;

  return {
    job,
    filled,
    rows,
    /** Shown beside the address picker, never written into it. */
    readAddress: values.deliveryAddress ?? "",
    /** Which direction to open the job in, when the document says. */
    domain: intake.domain === "IMPORT" || intake.domain === "EXPORT" ? intake.domain : null,
    /** What intake called the document, so the form can say what it read. */
    documentType: intake.documentType ?? null,
    count: Object.keys(job).length + (rows?.length ?? 0),
  };
}
