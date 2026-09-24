/**
 * What a read document becomes on the New Job form.
 *
 * The join between the carrier's vocabulary and this form's, the same job
 * `intake-fields.mjs` does for the review screen — and here for the same
 * reason. It lived inside the component, where it could not be tested, and it
 * read `response.fields` as a list. The route returns it keyed by field name.
 * Nothing caught that because nothing could: the only way to run the mapping
 * was to render the form and upload a PDF.
 *
 * So the mapping is a function that takes the response and returns what to
 * write, and the component does the writing. Every rule about what may be
 * taken from a document now has somewhere to be asserted.
 */
import { REVIEW_BELOW } from "./intake-fields.mjs";

/**
 * Document field to form field, where the names differ.
 *
 * Only the differences: a name absent here is taken as it stands, and the list
 * of what is taken at all is `TAKEN` below. Two tables rather than one because
 * "what may be copied onto this form" is a decision and "what it is called
 * here" is a detail, and only the first is interesting when reading this.
 */
const RENAMED = {
  voyage: "voyageNumber",
};

/**
 * What may be written onto the form from a document.
 *
 * An allowlist, not everything the reader can find. The reader returns ports,
 * terminals, consignees and package counts that this form has nowhere to put,
 * and a field written into a job nobody can see on the form is worse than one
 * not written at all.
 *
 * `deliveryAddress` is deliberately absent and always will be. The notice
 * prints one as free text, the customer master holds the real ones, and
 * matching "12 Jurong Port Rd" to a saved "12 Jurong Port Road" is a judgement
 * with a delivery on the end of it. It is returned separately, to show beside
 * the picker, and never applied.
 */
const TAKEN = [
  "vesselName", "voyage", "carrier", "blNumber", "houseBlNumber",
  "bookingReference", "shipper", "emptyCollectionYard", "exportClearanceReference",
  "permitNumber", "permitExpiryDate", "permitVesselVoyage",
];

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
 * Returns what to write and nothing else — no state is touched here, so the
 * whole of it can be asserted against a response without rendering anything.
 *
 * @param read     one document from /api/extract: { fields, containers }
 * @param existing the container rows already on the form, so typing is not lost
 */
export function jobFromDocument(read, existing = []) {
  // §11.1's envelope: keyed by field name, each entry carrying the value with
  // its confidence, the page and the line it was read from.
  const fields = read?.fields && typeof read.fields === "object" && !Array.isArray(read.fields)
    ? read.fields
    : {};

  const values = {};
  for (const [name, entry] of Object.entries(fields)) {
    const value = String(entry?.value ?? "").trim();
    if (value) values[name] = value;
  }
  const unsure = (name) => (fields[name]?.confidence ?? 0) < REVIEW_BELOW;

  const job = {};
  const filled = {};
  const mark = (key, from) => { filled[key] = unsure(from) ? "review" : "read"; };

  for (const name of TAKEN) {
    if (!values[name]) continue;
    const key = RENAMED[name] ?? name;
    job[key] = values[name];
    mark(key, name);
  }

  // An ETA arrives as a date, sometimes with a time on the end. The time is
  // kept: an arrival at 1700 and one at midnight are different days' work.
  if (values.eta) {
    const [date, time] = values.eta.split(/[ T]/);
    job.etaDate = date;
    mark("etaDate", "eta");
    if (time) job.etaTime = time.slice(0, 5);
  }

  // A document carrying a permit number is a job that needs a permit. The
  // customer's own setting can say so too; this only ever turns it on, because
  // a permit in hand is evidence and a blank customer record is not.
  if (values.permitNumber) job.permitRequired = true;

  // Containers, as rows. The document's rows replace a form nobody has typed
  // into; a form already holding containers is left alone, because overwriting
  // somebody's typing is worse than making them delete a row.
  const readRows = (Array.isArray(read?.containers) ? read.containers : [])
    .filter((c) => c?.containerNumber || c?.sizeType);
  const untouched = existing.length === 0
    || (existing.length === 1 && !existing[0]?.containerNumber && !existing[0]?.sizeType);

  const rows = readRows.length && untouched
    ? readRows.map((c) => ({
        ...EMPTY_ROW,
        containerNumber: String(c.containerNumber ?? "").toUpperCase(),
        sizeType: String(c.sizeType ?? "").toUpperCase(),
        grossWeight: c.grossWeight ?? "",
        emptyReturnYard: values.emptyReturnYard ?? "",
        // SPLIT and COMBINED are not interchangeable and the reader is told to
        // omit the shape rather than guess it. Absent means combined, which is
        // the form's own default, not a reading of the document.
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
    /** What to open the job as, when the document says. */
    domain: values.domain === "IMPORT" || values.domain === "EXPORT" ? values.domain : null,
    count: Object.keys(job).length + (rows?.length ?? 0),
  };
}
