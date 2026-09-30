"use client";

import { useEffect, useRef, useState } from "react";
import {
  CARRIERS, LOOKUP_WORDS, carrierByCode, checkPermit, wouldOverwrite,
} from "@greenlit/engine";
import { jobFromDocument, EMPTY_ROW } from "../lib/new-job-from-document.mjs";
import { useCustomerLocations } from "../lib/use-customer-locations.mjs";

/**
 * Creating a job by hand.
 *
 * Until now a job could only arrive by uploading a document, which is the
 * common case and not the only one: a customer rings, the booking is agreed,
 * and the notice follows two days later. There was nowhere to put that.
 *
 * Two flows rather than one form with a direction flag, because import and
 * export genuinely differ. On import the container exists and is coming
 * whatever anybody does, so the questions are about a box that is already on a
 * ship. On export nothing exists yet: the job is a request for empties, and
 * the container numbers will not be known until somebody collects them.
 *
 * ## Addresses come from the customer master, always
 *
 * There is no free-text destination anywhere in here. A typed address is one
 * nobody can plan against twice — "12 Jurong Port Rd" and "12 Jurong Port
 * Road" are two places as far as any grouping is concerned — and the master is
 * the only thing that makes a customer's locations reusable.
 *
 * ## One decision shapes the rest
 *
 * *Apply to job* or *ask per container*. Most jobs deliver everything to one
 * place and asking eleven times is noise; a job that splits across two
 * warehouses cannot be expressed any other way. Choosing it first means the
 * container rows know whether to show an address at all.
 */

const SIZES = ["20GP", "40GP", "40HQ", "20RF", "40RF", "40RQ"];
const REEFER = new Set(["20RF", "40RF", "40RQ"]);
/** 40ft equipment that has to be asked for and cannot be assumed. */
/**
 * What equipment a job can ask for, and which direction asks for it.
 *
 * Operations were explicit: an import needs a tri-axle and nothing else, and
 * an export needs heavy duty and 32.5 tonnes. The reason is the direction of
 * the weight — an import comes in loaded and the question is whether a chassis
 * can carry it away, while an export goes out loaded and the question is what
 * the box is rated to before it is stuffed.
 *
 * Offered on every size rather than only on the 40-footers. It was gated on
 * 40HQ and 40RF, so a 20GP that genuinely needed a tri-axle had nowhere to say
 * so, and operations asked for all sizes.
 */
const EQUIPMENT = {
  IMPORT: [["triAxle", "Tri-axle"]],
  EXPORT: [["heavyDuty", "Heavy duty"], ["rated32_5", "32.5 tonnes"], ["triAxle", "Tri-axle"]],
};

/** Half-hours, morning first — the way a person reads a working day. */
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 ? "30" : "00";
  const suffix = h < 12 ? "AM" : "PM";
  return { value: `${String(h).padStart(2, "0")}:${m}`, label: `${h % 12 || 12}:${m} ${suffix}` };
});

/**
 * Business fields are stored in capitals; remarks are left alone.
 *
 * Operations read these back against a paper document that is itself in
 * capitals, and a container number in mixed case is one more thing to squint
 * at. Remarks are sentences somebody wrote to be read, so they keep their case.
 */
const shout = (value) => String(value ?? "").toUpperCase();

/**
 * The sections, across the top — as somewhere to jump to, not as a gate.
 *
 * This was a four-step wizard, and a wizard is the wrong shape for this work.
 * Operations are not being walked through something unfamiliar: they have a
 * notice in front of them and they fill in what it says, in whatever order it
 * happens to be printed. A wizard makes that four clicks and hides the field
 * they wanted from the field they are looking at.
 *
 * So everything is on one form and this bar only says where things are, and
 * which sections still want something. A dot means outstanding; nothing means
 * that section is happy. Clicking scrolls.
 */
export function SectionNav({ sections, current, onJump }) {
  return (
    <nav className="import-create-tabs" aria-label="Sections of this form">
      {sections.map((section, index) => (
        <button
          key={section.id} type="button"
          className={`import-create-tab${current === section.id ? " current" : ""}`}
          aria-current={current === section.id ? "true" : undefined}
          onClick={() => onJump(section.id)}
        >
          {/* Numbered, as the demo's tabs are: the order is the order to work in. */}
          <span>{index + 1}. {section.label}</span>
          {section.outstanding ? (
            <>
              <span className="wants-dot" aria-hidden="true" />
              <span className="sr-only">— still needs something</span>
            </>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

/**
 * Read the arrival notice, and let it fill the form in.
 *
 * This lived on its own screen called Document Intake, which made reading a
 * document a separate errand from creating the job it belongs to — you went
 * there, read it, came back, and typed the job anyway. The document is not a
 * thing anybody wants for itself; it is how the form gets filled. So it sits
 * at the top of the form it fills.
 *
 * What it will not do is choose the delivery address. The notice prints one as
 * free text and the master holds the real ones, and quietly matching the two is
 * how a job ends up delivering to a plausible address nobody confirmed. The
 * read address is shown beside the picker instead, for a person to match.
 */
function NoaDrop({ onRead, onFile, note, busy, setBusy }) {
  const input = useRef(null);
  const [failed, setFailed] = useState("");
  const [over, setOver] = useState(false);

  async function read(files) {
    const file = files?.[0];
    if (!file) return;
    setFailed("");
    setBusy(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/extract", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "That document could not be read.");
      const read = Array.isArray(payload.documents) ? payload.documents[0] : payload;
      if (!read || read.error) throw new Error(read?.error || "Nothing could be read from that page.");
      onFile(file);
      onRead(read, file.name);
    } catch (problem) {
      setFailed(problem?.message || "That document could not be read.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="noa-module" aria-labelledby="noa-heading">
      <div className="noa-head">
        <div>
          <div className="section-title" id="noa-heading">Start from the document</div>
          <div className="muted">
            Arrival notice, booking confirmation or permit. It fills in what it
            can and you check it.
          </div>
        </div>
      </div>

      <div
        className={`noa-drop${over ? " over" : ""}${busy ? " busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files); }}
      >
        <input
          ref={input} type="file" className="noa-input"
          accept="application/pdf,image/*"
          onChange={(e) => read(e.target.files)}
        />
        {busy ? (
          <>
            <strong>Reading {busy}</strong>
            <span>Around ten seconds for a notice, longer for a photograph.</span>
          </>
        ) : (
          <>
            <strong>Drop a document here</strong>
            <span>PDF or a photo of one.</span>
            <button type="button" className="btn secondary" onClick={() => input.current?.click()}>
              Choose a file
            </button>
          </>
        )}
      </div>

      {failed ? <div className="callout" role="alert">{failed}</div> : null}
      {note ? <div className="noa-note" role="status">{note}</div> : null}
    </section>
  );
}

function Field({ label, required, hint, filled, children }) {
  // The label wraps its control rather than pointing at an id: one element, no
  // id to keep unique across eleven container rows, and it stays associated
  // however the rows are reordered.
  return (
    <label className={`field-wrap${filled ? ` from-document ${filled}` : ""}`}>
      <span className="field-label">
        {label}{required ? <span className="req"> *</span> : null}
        {filled ? (
          <span className="from-doc-tag">
            {filled === "review" ? "check this" : "from the document"}
          </span>
        ) : null}
      </span>
      {children}
      {hint ? <span className="field-helper">{hint}</span> : null}
    </label>
  );
}

/**
 * Copy one container's answer to the others — all of them, or the ones picked.
 *
 * The terms on a bill of lading are the same for every box on it far more
 * often than not, and typing the empty return yard eleven times is not only
 * slow: it is how eleven containers on one bill come to disagree about a
 * deadline the paperwork only ever stated once.
 *
 * Both shapes, because operations asked for both. A job of ten containers
 * usually shares everything; a job that splits across two yards shares one of
 * them with six and the other with four, and "all" cannot say that.
 *
 * What it will not do is replace a figure somebody typed without saying so.
 * That is the failure worth designing against here, because it is invisible
 * afterwards — the containers all agree, which is exactly what the control is
 * for, so nothing looks wrong.
 */
function Distribute({ rows, from, fields, what, onApply }) {
  const [picking, setPicking] = useState(false);
  const [ticked, setTicked] = useState(() => new Set());

  const others = rows.map((row, index) => ({ row, index })).filter((r) => r.index !== from);
  if (!others.length) return null;

  const nameOf = (row, index) => row.containerNumber || `Container ${index + 1}`;
  const incoming = Object.fromEntries(fields.map((f) => [f, rows[from][f]]));

  const apply = (targets) => {
    const clashes = wouldOverwrite(
      targets.map((t) => t.row), fields, incoming, (row) =>
        nameOf(row, rows.indexOf(row)));
    if (clashes.length && !window.confirm(
      `This replaces the ${what} already entered on ${clashes.join(", ")}. Continue?`,
    )) return;
    onApply(targets.map((t) => t.index), fields);
    setPicking(false);
    setTicked(new Set());
  };

  return (
    <div className="field-wrap full">
      <div className="action-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn ghost" onClick={() => apply(others)}>
          Apply {what} to all {rows.length}
        </button>
        <button
          type="button" className="btn ghost"
          aria-expanded={picking}
          onClick={() => setPicking((was) => !was)}
        >
          {picking ? "Cancel" : "Apply to selected…"}
        </button>
      </div>

      {picking ? (
        <div className="container-special-config">
          <div className="container-special-options">
            {others.map(({ row, index }) => (
              <label className="container-special-option" key={index}>
                <input
                  type="checkbox" checked={ticked.has(index)}
                  onChange={() => setTicked((was) => {
                    const next = new Set(was);
                    if (next.has(index)) next.delete(index); else next.add(index);
                    return next;
                  })}
                />
                {" "}{nameOf(row, index)}
              </label>
            ))}
          </div>
          <div className="action-row" style={{ marginTop: 8 }}>
            <button
              type="button" className="btn primary" disabled={ticked.size === 0}
              onClick={() => apply(others.filter((o) => ticked.has(o.index)))}
            >
              Apply to {ticked.size || "…"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A date and a half-hour, side by side, the way every date is asked here. */
function WhenField({ label, required, date, time, onDate, onTime }) {
  return (
    <Field label={label} required={required} hint="Date as DD/MM/YYYY">
      <div className="datetime-pair">
        <input
          className="app-date-input" type="date" value={date}
          onChange={(e) => onDate(e.target.value)}
        />
        <select className="app-time-input" value={time} onChange={(e) => onTime(e.target.value)}>
          <option value="">Time not known</option>
          {TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
    </Field>
  );
}

/** A new job's form, empty. Also what "Create & add another" resets to. */
const BLANK_JOB = {
  customerCode: "", pic: "",
  addressMode: "job", deliveryCompany: "", deliveryAddress: "",
  vesselName: "", voyageNumber: "", etaDate: "", etaTime: "", terminal: "",
  requestedDeliveryDate: "",
  carrier: "", blNumber: "", houseBlNumber: "",
  permitRequired: false,
  // What the site always needs, and what this one delivery needs instead.
  // Kept apart so an override is visibly an override rather than an edit to
  // the customer master made by accident from a job form.
  deliveryInstructions: "",
  permitNumber: "", permitExpiryDate: "", permitVesselVoyage: "",
  permitFileName: "", permitScope: "all", permitRows: [],
  // §24. Permits two onwards. The first is the one the reader fills in from
  // the document; a job commonly carries several.
  extraPermits: [],
  // export only
  bookingReference: "", exportClearanceReference: "", shipper: "",
  emptyCollectionYard: "", cmsStatus: "PENDING",
  emptyCollectionDate: "", emptyCollectionTime: "",
  etaSinDate: "", etaSinTime: "",
  class2S: false, class2C: false,
};
const BLANK_SLOT = {
  quantity: 1, sizeType: "20GP", reeferMode: "", reeferTemperature: "",
  heavyDuty: false, rated32_5: false, triAxle: false,
  stuffingCompany: "", stuffingAddress: "",
};

export default function ZhtNewJob({ customers = [], onCreate, onCancel, nextJobNumber, onCustomerChosen }) {
  const [type, setType] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  /** Which fields the document filled, so the form can say so. */
  const [filled, setFilled] = useState({});
  const [reading, setReading] = useState("");
  const [noaNote, setNoaNote] = useState("");
  /** A document read and waiting for review, before anything is applied. */
  const [pendingRead, setPendingRead] = useState(null);
  /** What the notice said the delivery address was. Shown, never applied. */
  const [readAddress, setReadAddress] = useState("");

  const form = useRef(null);
  /** The permit files chosen, by card, attached to the job once it exists. */
  const permitFiles = useRef({});
  const [job, setJob] = useState(() => ({ ...BLANK_JOB }));

  const set = (patch) => setJob((was) => ({ ...was, ...patch }));

  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [slots, setSlots] = useState([{ ...BLANK_SLOT }]);

  /**
   * Which section is open.
   *
   * It was one scrolling form for a while, on the reasoning that operations
   * fill things in whatever order the notice prints them. In front of a real
   * job it was too much at once: eleven container rows and a permit block
   * below the customer you are still choosing. One section at a time, which is
   * what his demo does and what this is going back to.
   *
   * The bar above stays exactly as it is — every section is reachable from any
   * other, so it is still navigation rather than a sequence of steps.
   */
  const [tab, setTab] = useState("sec-customer");

  /**
   * The document itself, beside the fields it filled.
   *
   * Reading a notice fills in most of a job and never all of it, and the part
   * left over is exactly the part somebody has to find on the page. Sending
   * them to another window to do that is how a free-time figure ends up typed
   * from memory.
   *
   * An object URL rather than the file: it costs nothing until the browser
   * draws it, and it is revoked when it is replaced or the form closes,
   * because these leak for the life of the document otherwise.
   */
  const [sourceUrl, setSourceUrl] = useState("");
  /** The document itself, attached to the job once it exists. */
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceName, setSourceName] = useState("");
  const [showSource, setShowSource] = useState(true);

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);

  const keepSource = (file) => {
    // Kept as the File, not only as a preview URL: it is attached to the job
    // once the job exists, so the notice it was read from stays with it.
    setSourceFile(file ?? null);
    setSourceUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : "";
    });
    setSourceName(file?.name ?? "");
  };

  const customer = customers.find((c) => c.code === job.customerCode);

  /**
   * The chosen customer's saved locations. The addresses live behind
   * `/api/customers/:code/locations`, not on the customer record; reading a
   * `locations` array off the customer left the pickers empty and no import
   * job could be created at all.
   */
  const {
    loading: loadingLocations, companies, addressesFor, siteAt, defaultSite,
  } = useCustomerLocations(job.customerCode);

  // The demo picks the customer's default company and address as soon as the
  // customer is chosen, so the ordinary job needs no second click.
  useEffect(() => {
    if (!defaultSite || job.addressMode !== "job" || job.deliveryAddress) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    set({ deliveryCompany: defaultSite.company || "", deliveryAddress: defaultSite.address || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.customerCode, defaultSite?.address]);

  const setRow = (i, patch) =>
    setRows((was) => was.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  /**
   * Copy one field from one container to the others.
   *
   * The empty return yard and the carrier's free time are the same for every
   * box on a bill of lading far more often than not, and typing them eleven
   * times is how they end up inconsistent.
   */
  /**
   * Copy the named fields from one container onto the ones chosen.
   *
   * Took "every row but this one" before, which could only ever express
   * "apply to the whole job". Operations wanted both that and "apply to these
   * three", and the difference is a list of indices.
   */
  const spread = (from, targets, keys) =>
    setRows((was) => was.map((row, n) => (targets.includes(n)
      ? { ...row, ...Object.fromEntries(keys.map((k) => [k, was[from][k]])) }
      : row)));

  // Every permit on the form as one list: the first is the one the reader
  // fills from a document, the rest are added by hand.
  const FIRST_KEYS = { permitNumber: "permitNumber", expiryDate: "permitExpiryDate",
    permitVesselVoyage: "permitVesselVoyage", fileName: "permitFileName", scope: "permitScope", rows: "permitRows" };
  const permitCards = [
    { permitNumber: job.permitNumber, expiryDate: job.permitExpiryDate, permitVesselVoyage: job.permitVesselVoyage,
      fileName: job.permitFileName, scope: job.permitScope || "all", rows: job.permitRows || [] },
    ...(job.extraPermits ?? []).map((p) => ({ scope: "all", rows: [], fileName: "", ...p })),
  ];
  const setCard = (index, patch) => {
    if (index === 0) {
      set(Object.fromEntries(Object.entries(patch).map(([k, v]) => [FIRST_KEYS[k], v])));
    } else {
      set({ extraPermits: job.extraPermits.map((p, i) => (i === index - 1 ? { ...p, ...patch } : p)) });
    }
  };
  const cardIssues = (card) => (card.permitNumber
    ? checkPermit(
        {
          permitId: "draft", permitNumber: card.permitNumber,
          expiryDate: card.expiryDate || null,
          permitVesselVoyage: card.permitVesselVoyage || null,
          fileName: card.fileName || null, linkedContainerIds: [],
        },
        { vesselName: job.vesselName || null, voyageNumber: job.voyageNumber || null, eta: job.etaDate || null },
      ).issues
    : []);
  const permitIssues = permitCards.flatMap(cardIssues);
  const entered = permitCards.filter((c) => c.permitNumber || c.fileName);
  // Which rows a permit covers: every row, or the ones ticked.
  const covers = (card, i) => card.scope !== "selected" || (card.rows ?? []).includes(i);
  const uncoveredRows = rows.map((_, i) => i).filter((i) => !entered.some((card) => covers(card, i)));

  function validate() {
    if (!job.customerCode) return ["sec-customer", "Choose a customer."];
    if (job.addressMode === "job" && !job.deliveryAddress) {
      return ["sec-customer", "Choose the delivery address, or switch to asking per container."];
    }
    if (type === "IMPORT") {
      if (!job.vesselName) return ["sec-shipment", "Enter the vessel."];
      // A vessel without a voyage is incomplete.
      if (!job.voyageNumber) return ["sec-shipment", "Enter the voyage."];
      if (!job.carrier) return ["sec-shipment", "Choose the master carrier."];
      if (rows.some((row) => !row.containerNumber?.trim())) {
        return ["sec-containers", "Please enter a container number for every import container."];
      }
      if (!job.blNumber) return ["sec-shipment", "Enter the master bill of lading."];
      if (job.addressMode === "container" && rows.some((r) => !r.deliveryAddress)) {
        return ["sec-containers", "Every container needs a delivery address."];
      }
    } else {
      if (!job.vesselName) return ["sec-shipment", "Enter the vessel."];
      if (!job.bookingReference) return ["sec-shipment", "Enter the booking reference."];
      // The empty collection yard is optional, as in the demo.
      if (job.addressMode === "container" && slots.some((sl) => !sl.stuffingAddress)) {
        return ["sec-containers", "Every container line needs its stuffing address."];
      }
      if (slots.some((s) => REEFER.has(s.sizeType) && (!s.reeferMode || !s.reeferTemperature))) {
        return ["sec-containers", "A reefer needs its instruction and temperature."];
      }
    }
    return null;
  }

  /**
   * Create, then stay here with the customer kept.
   *
   * Jobs arrive in runs — one customer, one vessel, four bookings — and going
   * back to an empty form between them means retyping the half that never
   * changed. What is cleared is what differs: the references, the containers.
   */
  const [again, setAgain] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const failure = validate();
    if (!failure && type === "IMPORT") {
      // The demo asks before creating a job it can see a problem with. It
      // does not refuse: the permit may be on its way.
      const worries = [];
      if (job.permitRequired && entered.length === 0) worries.push("No permit has been entered.");
      if (job.permitRequired && permitIssues.length) worries.push(...permitIssues);
      if (job.permitRequired && entered.length && uncoveredRows.length) {
        worries.push(`No permit covers ${uncoveredRows.map((i) => rows[i].containerNumber || `container ${i + 1}`).join(", ")}.`);
      }
      const eta = job.etaDate;
      rows.forEach((row, i) => {
        const when = row.requestedDeliveryDate || job.requestedDeliveryDate;
        if (eta && when && when < eta) {
          worries.push(`${row.containerNumber || `Container ${i + 1}`}: delivery date is before the ETA.`);
        }
      });
      if (worries.length && !window.confirm(`${worries.join("\n")}\n\nCreate the job anyway?`)) return;
    }
    if (failure) { setProblem(failure[1]); setTab(failure[0]); return; }

    setBusy(true);
    setProblem("");
    const when = (d, t) => (d ? (t ? `${d}T${t}` : d) : null);

    const draft = type === "IMPORT"
      ? {
          customerCode: job.customerCode,
          pointOfContact: shout(job.pic) || null,
          carrier: job.carrier || null,
          deliveryInstructions: job.deliveryInstructions || null,
          blNumber: shout(job.blNumber) || null,
          houseBlNumber: shout(job.houseBlNumber) || null,
          vesselName: shout(job.vesselName) || null,
          voyageNumber: shout(job.voyageNumber) || null,
          eta: when(job.etaDate, job.etaTime),
          // The shipment's, beside the vessel and ETA: one sailing lands at
          // one terminal.
          terminal: shout(job.terminal) || null,
          deliveryAddress: job.addressMode === "job" ? job.deliveryAddress : null,
          deliveryCompany: job.addressMode === "job" ? (job.deliveryCompany || null) : null,
          permitRequired: job.permitRequired,
          permitNumber: shout(job.permitNumber) || null,
          permitExpiryDate: job.permitExpiryDate || null,
          permitVesselVoyage: shout(job.permitVesselVoyage) || null,
          // §24. Every permit in hand, stored as records rather than as three
          // fields on the job. They were collected here and written nowhere,
          // so a permit read off a document vanished the moment it was saved.
          permits: job.permitRequired ? permitCards
            .filter((card) => card.permitNumber || card.fileName)
            .map((card) => ({
              permitNumber: shout(card.permitNumber) || null,
              expiryDate: card.expiryDate || null,
              permitVesselVoyage: shout(card.permitVesselVoyage) || null,
              fileName: card.fileName || null,
              // Every container, or the rows ticked.
              ...(card.scope === "selected" ? { containerIndexes: card.rows ?? [] } : {}),
            })) : [],
          // Which rows the release email covered, recorded once the job exists
          // and its containers have ids.
          portnetReleasedRows: rows.flatMap((r, i) => (r.portnetReleased ? [i] : [])),
          containers: rows.map((r) => ({
            containerNumber: shout(r.containerNumber) || null,
            sizeType: r.sizeType || null,
            grossWeight: r.grossWeight === "" ? null : Number(r.grossWeight),
            // Collected on this form since the start and posted by none of it:
            // the yard, the chassis and the per-container address were typed,
            // validated, and then dropped at submit.
            emptyReturnYard: shout(r.emptyReturnYard) || null,
            triAxle: r.triAxle === true,
            // The customer's date: this box's own when it differs, the job's
            // otherwise.
            requestedDeliveryDate: r.requestedDeliveryDate || job.requestedDeliveryDate || null,
            requestedDeliveryTime: r.requestedDeliveryTime || null,
            deliveryInstructions: r.deliveryInstructions?.trim() || null,
            deliveryCompany: job.addressMode === "container" ? (r.deliveryCompany || null) : null,
            deliveryAddress: job.addressMode === "container" ? (r.deliveryAddress || null) : null,
            freeTimeModel: r.freeTimeModel,
            combinedFreeDays: r.combinedFreeDays === "" ? null : Number(r.combinedFreeDays),
            demurrageFreeDays: r.demurrageFreeDays === "" ? null : Number(r.demurrageFreeDays),
            detentionFreeDays: r.detentionFreeDays === "" ? null : Number(r.detentionFreeDays),
          })),
        }
      : {
          customerCode: job.customerCode,
          pointOfContact: shout(job.pic) || null,
          shipper: shout(job.shipper) || null,
          bookingReference: shout(job.bookingReference) || null,
          exportClearanceReference: shout(job.exportClearanceReference) || null,
          vesselName: shout(job.vesselName) || null,
          voyageNumber: shout(job.voyageNumber) || null,
          // ETA SIN is the vessel's. The collection date was being saved here.
          etaSingapore: when(job.etaSinDate, job.etaSinTime),
          emptyCollectionYard: shout(job.emptyCollectionYard) || null,
          emptyCollectionDate: job.emptyCollectionDate || null,
          emptyCollectionTime: job.emptyCollectionTime || null,
          cmsStatus: job.cmsStatus === "COMPLETED" ? "COMPLETED" : "PENDING",
          class2S: job.class2S === true,
          class2C: job.class2C === true,
          // Where the boxes are stuffed: the job's address, or each line's.
          stuffingCompany: job.addressMode === "job" ? (job.deliveryCompany || null) : null,
          stuffingAddress: job.addressMode === "job" ? (job.deliveryAddress || null) : null,
          deliveryInstructions: job.deliveryInstructions || null,
          containerQuantity: slots.reduce((n, s) => n + Number(s.quantity || 0), 0),
          // The lines themselves, so a mixed booking keeps its sizes. Only the
          // total and the first size were sent, and every container was made
          // at that first size.
          slots: slots.map((s) => ({
            quantity: Number(s.quantity || 1),
            sizeType: s.sizeType || "",
            heavyDuty: s.heavyDuty === true,
            rated32_5: s.rated32_5 === true,
            triAxle: s.triAxle === true,
            stuffingCompany: job.addressMode === "container" ? (s.stuffingCompany || null) : null,
            stuffingAddress: job.addressMode === "container" ? (s.stuffingAddress || null) : null,
            reeferMode: s.reeferMode || null,
            reeferTemperature: s.reeferTemperature || null,
          })),
          containerSizeType: slots[0]?.sizeType ?? null,
        };

    try {
      await onCreate(type, draft, { stayHere: again, sourceFile, permitFiles: { ...permitFiles.current } });
      if (again) {
        // A blank job, as the demo does. Keeping half the last one carried its
        // permits and its document onto the next job without anyone noticing.
        setJob({ ...BLANK_JOB });
        permitFiles.current = {};
        setRows([{ ...EMPTY_ROW }]);
        setSlots([{ ...BLANK_SLOT }]);
        setNoaNote("");
        setFilled({});
        setReadAddress("");
        setPendingRead(null);
        setSourceFile(null);
        setSourceName("");
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        setSourceUrl("");
        setTab("sec-customer");
        onCustomerChosen?.("");
      }
    } catch (failed) {
      setProblem(failed?.message || "The job could not be created.");
    } finally {
      setBusy(false);
    }
  }

  // ---- the chooser --------------------------------------------------------
  if (!type) {
    return (
      <div className="zht"><div className="content">
        <div className="job-type-chooser">
          <div className="creation-intro">
            <div className="creation-kicker">NEW JOB</div>
            <h4>Which direction?</h4>
            <div className="muted">
              The two are different work, so they ask for different things.
            </div>
          </div>
          <div className="job-type-grid">
            <button type="button" className="job-type-card" onClick={() => setType("IMPORT")}>
              <div className="job-type-icon">↓</div>
              <div>
                <strong>Import</strong>
                <span>A container is on its way. Terminal to the customer, then the empty back.</span>
              </div>
              <div className="job-type-arrow">→</div>
            </button>
            <button type="button" className="job-type-card" onClick={() => setType("EXPORT")}>
              <div className="job-type-icon">↑</div>
              <div>
                <strong>Export</strong>
                <span>Empties to collect, stuff, and take to the port before the vessel closes.</span>
              </div>
              <div className="job-type-arrow">→</div>
            </button>
          </div>
          <div className="action-row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
            <button className="btn secondary" type="button" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div></div>
    );
  }

  const isImport = type === "IMPORT";

  /**
   * What is wrong with the permit, if anything.
   *
   * Empty until a permit has actually been read — there is nothing to say
   * about a permit nobody has uploaded, and an empty checklist reads as a
   * failure rather than as an absence.
   */

  /**
   * What each section still wants, computed live.
   *
   * The same conditions validate() refuses on, asked continuously rather than
   * at the end. A form that only tells you what is missing once you press
   * Create is a form you press Create to interrogate.
   */
  const sections = [
    {
      id: "sec-customer", label: "Customer & delivery",
      outstanding: !job.customerCode || (job.addressMode === "job" && !job.deliveryAddress),
    },
    {
      id: "sec-shipment", label: "Shipment",
      outstanding: isImport
        ? !job.vesselName || !job.blNumber
        : !job.bookingReference || !job.vesselName,
    },
    {
      id: "sec-containers", label: "Containers",
      outstanding: isImport
        ? (job.addressMode === "container" && rows.some((r) => !r.deliveryAddress))
        : slots.some((s) => REEFER.has(s.sizeType) && (!s.reeferMode || !s.reeferTemperature)),
    },
    ...(isImport ? [{ id: "sec-permit", label: "Permit", outstanding: permitIssues.length > 0 }] : []),
  ];

  // The permit section exists on imports only, so a controller who was reading
  // it and then switched direction would be looking at a bar with nothing
  // under it. Fall back to the first section rather than render a blank.
  const openTab = sections.some((section) => section.id === tab) ? tab : sections[0].id;

  /**
   * Take what the document said.
   *
   * Everything it read is written in and marked as read, because a field left
   * empty for a person to copy across from a PDF open in another window is the
   * work this was meant to remove. Nothing here is silently authoritative:
   * every filled field says where it came from and stays editable, and the one
   * field that cannot be matched safely — the delivery address — is shown
   * beside the picker rather than chosen.
   */
  // The demo's Extraction Review: what was read is shown first, and nothing is
  // written into the form until "Apply Reviewed Extraction".
  function applyDocument(read, fileName) {
    setPendingRead({ read, fileName });
  }
  function applyReviewed() {
    if (!pendingRead) return;
    const { read, fileName } = pendingRead;
    setPendingRead(null);
    const {
      job: patch, filled: marks, rows: readRows,
      readAddress: address, count, documentType,
    } = jobFromDocument(read, rows);

    set(patch);
    setReadAddress(address);
    if (readRows) setRows(readRows);
    setFilled((was) => ({ ...was, ...marks }));

    // What it read, and what it is unsure of, said separately. "12 fields" is
    // reassurance; "2 of them need a look" is the only part that is work.
    const doubted = Object.values(marks).filter((mark) => mark === "review").length;
    setNoaNote(count
      ? `Read ${count} ${count === 1 ? "value" : "values"} from `
        + `${documentType ? `${documentType.toLowerCase()} ` : ""}${fileName}.`
        + (doubted ? ` ${doubted} came off the page unclearly — they are marked.` : "")
      : `Nothing usable was found in ${fileName}.`);
  }

  return (
    <div className="zht"><div className="content">
      <form onSubmit={submit} ref={form}>
        <div className="creation-workspace-head">
          <button type="button" className="btn ghost" onClick={() => setType(null)}>
            ← Change direction
          </button>
          <div className={`creation-type-badge ${isImport ? "import" : "export"}`}>
            {isImport ? "IMPORT JOB" : "EXPORT JOB"}
            {/* The number it will get, before it gets it. Operations write it
                on the paperwork while the form is still open. */}
            {nextJobNumber ? <span style={{ marginLeft: 8, opacity: 0.8 }}>{nextJobNumber}</span> : null}
          </div>
        </div>

        <NoaDrop
          onRead={applyDocument} onFile={keepSource} note={noaNote}
          busy={reading} setBusy={setReading}
        />

        {pendingRead ? (() => {
          const preview = jobFromDocument(pendingRead.read, []);
          const p = preview.job ?? {};
          const lines = [
            ["Master carrier", p.carrier], ["Vessel", p.vesselName], ["Voyage", p.voyageNumber],
            ["ETA SIN", p.etaDate ? `${p.etaDate}${p.etaTime ? ` ${p.etaTime}` : ""}` : ""],
            ["MBL", p.blNumber], ["HBL", p.houseBlNumber],
            ["Empty return yard", preview.rows?.[0]?.emptyReturnYard],
          ];
          return (
            <div className="card" role="region" aria-label="Extraction review" style={{ marginBottom: 12 }}>
              <div className="section-title">Extraction Review · {pendingRead.fileName}</div>
              <div className="muted">Check what was read. Nothing is written into the form until you apply it.</div>
              <div className="fieldgrid" style={{ marginTop: 8 }}>
                {lines.map(([label, value]) => (
                  <div className="field" key={label}><span className="field-label">{label}</span><b>{value || "Not read"}</b></div>
                ))}
              </div>
              {preview.rows?.length ? (
                <table className="moves" style={{ marginTop: 8 }}>
                  <thead><tr><th>Container</th><th>Format</th><th>Size</th></tr></thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.containerNumber || "—"}</td>
                        <td>{/^[A-Z]{4}\d{7}$/.test(row.containerNumber || "") ? "OK" : "Check"}</td>
                        <td>{row.sizeType || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <div className="action-row" style={{ marginTop: 10, gap: 8 }}>
                <button type="button" className="btn primary" onClick={applyReviewed}>Apply Reviewed Extraction</button>
                <button type="button" className="btn secondary" onClick={() => setPendingRead(null)}>Keep Manual Entry</button>
              </div>
            </div>
          );
        })() : null}

        <SectionNav sections={sections} current={openTab} onJump={setTab} />

        <div className={`creation-split${sourceUrl && showSource ? " with-source" : ""}`}>
        <div className="creation-panels">

        {problem ? (
          <div className="callout" role="alert" style={{ marginBottom: 14 }}>{problem}</div>
        ) : null}

        {/* ---- 1. customer & delivery ------------------------------------ */}
        {openTab === "sec-customer" ? (
        <section id="sec-customer" className="creation-section">
            <div className="creation-section-head">
              <div>
                <div className="section-title">Customer &amp; delivery</div>
                <div className="muted">
                  Addresses come from this customer’s saved locations.
                </div>
              </div>
            </div>
            <div className="formgrid job-create-grid">
              <Field label="Customer" required>
                <select
                  value={job.customerCode}
                  onChange={(e) => {
                    // The customer's own setting becomes this job's default.
                    // It is a default and not a rule: a customer who never
                    // needs a permit occasionally ships something that does,
                    // and the toggle on the Permit section still decides.
                    const chosen = customers.find((c) => c.code === e.target.value);
                    set({
                      customerCode: e.target.value,
                      deliveryCompany: "", deliveryAddress: "",
                      permitRequired: Boolean(chosen?.requiresPermit),
                      // The customer's usual contact, from the Customer Master,
                      // so it is not typed again. Changeable for this job.
                      pic: shout(chosen?.defaultContact ?? ""),
                    });
                    // The reference is the customer's next one, so it can only
                    // be previewed once there is a customer.
                    onCustomerChosen?.(e.target.value);
                  }}
                >
                  <option value="">Choose a customer</option>
                  {customers.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.companyName ?? c.code}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Point of contact">
                <input value={job.pic} onChange={(e) => set({ pic: shout(e.target.value) })} />
              </Field>

              <div className="field-wrap full">
                <span className="field-label">Delivery address<span className="req"> *</span></span>
                <div className="delivery-mode-options">
                  <button
                    type="button"
                    className={`delivery-mode-btn${job.addressMode === "job" ? " active" : ""}`}
                    onClick={() => {
                      // Switching back hides the per-container addresses, and
                      // hiding them is how somebody loses twenty minutes of
                      // typing without being told. Ask before, not after.
                      const entered = rows.filter((r) => r.deliveryAddress).length;
                      if (entered > 0 && !window.confirm(
                        `${entered} container${entered === 1 ? " has" : "s have"} their own `
                        + `delivery address. Using one address for the job will discard `
                        + `${entered === 1 ? "it" : "them"}. Continue?`,
                      )) return;
                      setRows((was) => was.map((r) => ({ ...r, deliveryCompany: "", deliveryAddress: "" })));
                      set({ addressMode: "job" });
                    }}
                  >
                    <b>One address for the job</b>
                    <span>Every container goes to the same place.</span>
                  </button>
                  <button
                    type="button"
                    className={`delivery-mode-btn${job.addressMode === "container" ? " active" : ""}`}
                    onClick={() => set({ addressMode: "container" })}
                  >
                    <b>Ask for each container</b>
                    <span>Each container is asked separately.</span>
                  </button>
                </div>
              </div>

              {job.addressMode === "job" ? (
                <>
                  <Field label="Delivery company" required>
                    <select
                      value={job.deliveryCompany}
                      onChange={(e) => set({ deliveryCompany: e.target.value, deliveryAddress: "" })}
                      disabled={!customer}
                    >
                      <option value="">
                        {!customer ? "Choose a customer first"
                          : loadingLocations ? "Loading saved addresses…"
                            : companies.length ? "Choose a company"
                              : "This customer has no saved addresses"}
                      </option>
                      {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Delivery address" required>
                    <select
                      value={job.deliveryAddress}
                      onChange={(e) => set({ deliveryAddress: e.target.value })}
                      disabled={!job.deliveryCompany}
                    >
                      <option value="">Choose an address</option>
                      {addressesFor(job.deliveryCompany).map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </Field>

                  {/* The site's standing instructions, shown as soon as the
                      address is chosen, because they decide whether this job
                      is workable at all — a site that only receives before
                      noon changes the delivery date, not the driver's morning.

                      Shown rather than copied. They belong to the place and
                      change there; a job that carried its own copy would still
                      be showing last year's gate number. The override below is
                      the exception, and is deliberately a separate field so it
                      reads as one. */}
                  {siteAt(job.deliveryCompany, job.deliveryAddress)?.operationalInstructions ? (
                    <div className="nc-job-address-preview full">
                      <b>Always at this address</b>
                      {siteAt(job.deliveryCompany, job.deliveryAddress).operationalInstructions}
                    </div>
                  ) : null}

                  {job.deliveryAddress ? (
                    <Field
                      label="Just for this job"
                      hint="Anything true of this delivery only. The site's own instructions above are unchanged."
                    >
                      <textarea
                        rows={2} value={job.deliveryInstructions}
                        onChange={(e) => set({ deliveryInstructions: e.target.value })}
                      />
                    </Field>
                  ) : null}
                </>
              ) : null}

              {/* What the notice said, beside the picker rather than in it.
                  Matching "12 Jurong Port Rd" to a saved "12 Jurong Port Road"
                  is a judgement with a delivery on the end of it, so a person
                  makes it. Shown until they have chosen. */}
              {customer && !loadingLocations && companies.length === 0 ? (
                <div className="callout" role="status">
                  <b>{customer.companyName ?? customer.code} has no saved delivery addresses.</b>
                  <span>
                    {" "}Add them in Customer Master, then come back. Addresses are kept
                    there so the same place is the same place on every job.
                  </span>
                </div>
              ) : null}

              {readAddress && job.addressMode === "job" && !job.deliveryAddress ? (
                <div className="nc-job-address-preview">
                  <b>The document says:</b> {readAddress}
                  <span>Pick the matching saved location, or add it to the customer first.</span>
                </div>
              ) : null}
            </div>
        </section>
        ) : null}

        {/* ---- 2. shipment ----------------------------------------------- */}
        {openTab === "sec-shipment" ? (
        <section id="sec-shipment" className="creation-section">
            <div className="creation-section-head">
              <div>
                <div className="section-title">Shipment</div>
                <div className="muted">
                  {isImport
                    ? "What the arrival notice says."
                    : "The booking, and the two dates an export job is worked against."}
                </div>
              </div>
            </div>

            <div className="formgrid job-create-grid">
              <Field label="Vessel" required>
                <input value={job.vesselName} onChange={(e) => set({ vesselName: shout(e.target.value) })} />
              </Field>
              <Field label="Voyage" required={isImport}>
                <input value={job.voyageNumber} onChange={(e) => set({ voyageNumber: shout(e.target.value) })} />
              </Field>

              {isImport ? (
                <>
                  <WhenField
                    label="ETA Singapore" date={job.etaDate} time={job.etaTime}
                    onDate={(v) => set({ etaDate: v })} onTime={(v) => set({ etaTime: v })}
                  />
                  <Field label="Terminal">
                    <input value={job.terminal} onChange={(e) => set({ terminal: shout(e.target.value) })}
                      placeholder="PSA Pasir Panjang, Tuas…" />
                  </Field>
                  {/* The customer gives the delivery date. The controller may
                      bring it forward once the box is released and discharged. */}
                  <Field label="Requested delivery date" hint="As the customer asked. A container can have its own below.">
                    <input type="date" className="app-date-input" value={job.requestedDeliveryDate}
                      onChange={(e) => set({ requestedDeliveryDate: e.target.value })} />
                  </Field>
                  {/* A notice issued by the carrier names itself; one issued
                      by a forwarder often does not, so this has to be
                      selectable rather than only read. The code is what
                      operations say and what fits in a table — the notice
                      prints "ORIENT OVERSEAS CONTAINER LINE" and this shows
                      OOCL. */}
                  <Field label="Master carrier" required filled={filled.carrier}>
                    <select value={job.carrier} onChange={(e) => set({ carrier: e.target.value })}>
                      <option value="">Choose the carrier</option>
                      {CARRIERS.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </Field>
                  {carrierByCode(job.carrier) ? (
                    <div className="nc-job-address-preview full">
                      <b>{carrierByCode(job.carrier).name}</b>
                      <span>
                        Empty return yard: {LOOKUP_WORDS[carrierByCode(job.carrier).returnYard]}.
                        {" "}Last free day: {LOOKUP_WORDS[carrierByCode(job.carrier).lastFreeDay]}.
                      </span>
                      {carrierByCode(job.carrier).note
                        ? <span>{carrierByCode(job.carrier).note}</span> : null}
                    </div>
                  ) : null}

                  <Field label="Master bill of lading" required>
                    <input value={job.blNumber} onChange={(e) => set({ blNumber: shout(e.target.value) })} />
                  </Field>
                  <Field label="House bill of lading">
                    <input value={job.houseBlNumber} onChange={(e) => set({ houseBlNumber: shout(e.target.value) })} />
                  </Field>
                  <Field label="Permit applicability" required>
                    <select
                      value={job.permitRequired ? "yes" : "no"}
                      onChange={(e) => set({ permitRequired: e.target.value === "yes" })}
                    >
                      <option value="no">Not required</option>
                      <option value="yes">Required</option>
                    </select>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Booking reference" required>
                    <input value={job.bookingReference} onChange={(e) => set({ bookingReference: shout(e.target.value) })} />
                  </Field>
                  <Field label="Export clearance reference">
                    <input value={job.exportClearanceReference} onChange={(e) => set({ exportClearanceReference: shout(e.target.value) })} />
                  </Field>
                  <Field label="Shipper">
                    <input value={job.shipper} onChange={(e) => set({ shipper: shout(e.target.value) })} />
                  </Field>
                  <WhenField
                    label="ETA SIN" date={job.etaSinDate} time={job.etaSinTime}
                    onDate={(v) => set({ etaSinDate: v })} onTime={(v) => set({ etaSinTime: v })}
                  />
                  <Field label="Empty collection yard">
                    <input value={job.emptyCollectionYard} onChange={(e) => set({ emptyCollectionYard: shout(e.target.value) })} />
                  </Field>
                  <WhenField
                    label="Empty collection" date={job.emptyCollectionDate} time={job.emptyCollectionTime}
                    onDate={(v) => set({ emptyCollectionDate: v })} onTime={(v) => set({ emptyCollectionTime: v })}
                  />
                  <Field
                    label="CMS"
                    hint="Required before a driver can be sent for the empty."
                  >
                    <select value={job.cmsStatus} onChange={(e) => set({ cmsStatus: e.target.value })}>
                      <option value="PENDING">Pending</option>
                      <option value="COMPLETED">Done</option>
                    </select>
                  </Field>
                  <div className="field-wrap full">
                    <span className="field-label">Dangerous goods<span className="optional-label"> If it applies</span></span>
                    <div className="export-class-options">
                      <label className="container-special-option">
                        <input type="checkbox" checked={job.class2S} onChange={(e) => set({ class2S: e.target.checked })} /> Class 2S
                      </label>
                      <label className="container-special-option">
                        <input type="checkbox" checked={job.class2C} onChange={(e) => set({ class2C: e.target.checked })} /> Class 2C
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* Remarks was here, and nothing saved it. Delivery instructions
                  come from the customer's saved address, and "Just for this
                  job" holds anything true of this delivery only. */}
            </div>
        </section>
        ) : null}

        {/* ---- 3. containers --------------------------------------------- */}
        {openTab === "sec-containers" && isImport ? (
          <section id="sec-containers" className="creation-section">
            <div className="creation-section-head">
              <div>
                <div className="section-title">Containers</div>
                <div className="muted">
                  One row per box. Copy the yard and free time across with the
                  button on any row.
                </div>
              </div>
              {/* The release email usually covers the whole job. */}
              <button type="button" className="btn secondary"
                onClick={() => setRows((was) => was.map((row) => ({ ...row, portnetReleased: true })))}>
                Portnet released: all
              </button>
            </div>

            {rows.map((r, i) => (
              <div className="container-entry" key={i}>
                <div className="container-entry-head">
                  <b>Container {i + 1}</b>
                  {rows.length > 1 ? (
                    <button
                      type="button" className="btn ghost"
                      onClick={() => setRows((was) => was.filter((_, n) => n !== i))}
                    >Remove</button>
                  ) : null}
                </div>

                <div className="formgrid">
                  <Field label="Container number" required>
                    <input
                      value={r.containerNumber}
                      onChange={(e) => setRow(i, { containerNumber: shout(e.target.value) })}
                      placeholder="Four letters and seven digits"
                    />
                    {r.containerNumber && !/^[A-Z]{4}\d{7}$/.test(r.containerNumber) ? (
                      <div className="validation-warn">
                        Not the usual shape. Check it against the notice — you can still save.
                      </div>
                    ) : null}
                  </Field>

                  <Field label="Size">
                    <select value={r.sizeType} onChange={(e) => setRow(i, { sizeType: e.target.value })}>
                      <option value="">Choose a size</option>
                      {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>

                  <Field label="Weight (kg)">
                    <input
                      type="number" step="0.001" min="0" value={r.grossWeight}
                      onChange={(e) => setRow(i, { grossWeight: e.target.value })}
                    />
                  </Field>

                  <Field label="Requested delivery date" hint="Blank uses the job's date.">
                    <input type="date" className="app-date-input" value={r.requestedDeliveryDate ?? ""}
                      onChange={(e) => setRow(i, { requestedDeliveryDate: e.target.value })} />
                  </Field>
                  <Field label="Container delivery instructions" hint="For this box only, whatever the delivery mode.">
                    <input value={r.deliveryInstructions ?? ""}
                      onChange={(e) => setRow(i, { deliveryInstructions: e.target.value })} />
                  </Field>
                  <Field label="Delivery time">
                    <select className="app-time-input" value={r.requestedDeliveryTime ?? ""}
                      onChange={(e) => setRow(i, { requestedDeliveryTime: e.target.value })}>
                      <option value="">Time not known</option>
                      {TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>
                  {job.permitRequired ? (
                    <div className="muted full">
                      Permit(s) linked to this container:{" "}
                      {entered.filter((card) => covers(card, i)).map((card) => card.permitNumber || card.fileName).join(", ") || "none yet"}
                    </div>
                  ) : null}

                  <div className="container-special-config">
                    <div className="container-special-title">Equipment</div>
                    <div className="container-special-help">
                      Asked rather than assumed: a tri-axle that was needed and not
                      booked is a truck that turns up and cannot load.
                    </div>
                    <div className="container-special-options">
                      {EQUIPMENT.IMPORT.map(([key, label]) => (
                        <label className="container-special-option" key={key}>
                          <input
                            type="checkbox" checked={Boolean(r[key])}
                            onChange={(e) => setRow(i, { [key]: e.target.checked })}
                          />
                          {" "}{label}
                        </label>
                      ))}
                      {/* Operations often have the release email before the
                          job exists. Ticked boxes are recorded as released
                          when the job is saved, as the same audited event the
                          job screen and the board record. */}
                      <label className="container-special-option">
                        <input
                          type="checkbox" checked={Boolean(r.portnetReleased)}
                          onChange={(e) => setRow(i, { portnetReleased: e.target.checked })}
                        />
                        {" "}Portnet released
                      </label>
                    </div>
                  </div>

                  {job.addressMode === "container" ? (
                    <>
                      <Field label="Delivery company" required>
                        <select
                          value={r.deliveryCompany}
                          onChange={(e) => setRow(i, { deliveryCompany: e.target.value, deliveryAddress: "" })}
                          disabled={!customer}
                        >
                          <option value="">
                            {loadingLocations ? "Loading saved addresses…"
                              : companies.length ? "Choose a company"
                                : "This customer has no saved addresses"}
                          </option>
                          {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Field>
                      <Field label="Delivery address" required>
                        <select
                          value={r.deliveryAddress}
                          onChange={(e) => setRow(i, { deliveryAddress: e.target.value })}
                          disabled={!r.deliveryCompany}
                        >
                          <option value="">Choose an address</option>
                          {addressesFor(r.deliveryCompany).map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </Field>
                    </>
                  ) : null}

                  <div className="field-wrap full">
                    <label className="field-label">
                      Empty return yard
                      <input
                        value={r.emptyReturnYard}
                        onChange={(e) => setRow(i, { emptyReturnYard: shout(e.target.value) })}
                      />
                    </label>
                    <Distribute
                      rows={rows} from={i} fields={["emptyReturnYard"]}
                      what="this yard"
                      onApply={(targets, fields) => spread(i, targets, fields)}
                    />
                  </div>

                  <Field label="Free time">
                    <select
                      value={r.freeTimeModel}
                      onChange={(e) => setRow(i, { freeTimeModel: e.target.value })}
                    >
                      <option value="COMBINED">Combined D+D</option>
                      <option value="SPLIT">Separate demurrage and detention days</option>
                      <option value="NOT_CONFIRMED">Terms not read yet</option>
                    </select>
                  </Field>

                  {r.freeTimeModel === "COMBINED" ? (
                    <Field label="Free days" hint="Counted from the vessel ETA, which is day one.">
                      <input
                        type="number" min="0" step="1" value={r.combinedFreeDays}
                        onChange={(e) => setRow(i, { combinedFreeDays: e.target.value })}
                      />
                    </Field>
                  ) : r.freeTimeModel === "SPLIT" ? (
                    <>
                      <Field label="Demurrage days">
                        <input
                          type="number" min="0" step="1" value={r.demurrageFreeDays}
                          onChange={(e) => setRow(i, { demurrageFreeDays: e.target.value })}
                        />
                      </Field>
                      <Field label="Detention days">
                        <input
                          type="number" min="0" step="1" value={r.detentionFreeDays}
                          onChange={(e) => setRow(i, { detentionFreeDays: e.target.value })}
                        />
                      </Field>
                    </>
                  ) : null}

                  {rows.length > 1 ? (
                    <Distribute
                      rows={rows} from={i}
                      fields={["freeTimeModel", "combinedFreeDays", "demurrageFreeDays", "detentionFreeDays"]}
                      what="this free time"
                      onApply={(targets, fields) => spread(i, targets, fields)}
                    />
                  ) : null}
                </div>
              </div>
            ))}

            <button
              type="button" className="btn secondary"
              onClick={() => setRows((was) => [...was, { ...was[was.length - 1], containerNumber: "", grossWeight: "" }])}
            >
              + Another container
            </button>
          </section>
        ) : null}

        {openTab === "sec-containers" && !isImport ? (
          <section id="sec-containers" className="creation-section">
            <div className="creation-section-head">
              <div>
                <div className="section-title">Containers</div>
                <div className="muted">
                  How many, and of what. Numbers and seals come later, after collection.
                </div>
              </div>
            </div>

            {slots.map((s, i) => (
              <div className="export-req-row" key={i}>
                <label className="export-req-field">
                  <span className="field-label">Quantity</span>
                  <input
                    type="number" min="1" step="1" value={s.quantity}
                    onChange={(e) => setSlots((was) => was.map((x, n) => (n === i ? { ...x, quantity: e.target.value } : x)))}
                  />
                </label>
                <label className="export-req-field">
                  <span className="field-label">Size</span>
                  <select
                    value={s.sizeType}
                    onChange={(e) => setSlots((was) => was.map((x, n) => (n === i ? { ...x, sizeType: e.target.value, reeferMode: "", reeferTemperature: "" } : x)))}
                  >
                    {SIZES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </label>
                {slots.length > 1 ? (
                  <button
                    type="button" className="btn secondary export-req-remove"
                    onClick={() => setSlots((was) => was.filter((_, n) => n !== i))}
                  >Remove</button>
                ) : <span />}

                {/* Export asks the other two. An export goes out loaded, so
                    the question is what the box is rated to before it is
                    stuffed — an import comes in loaded and the question is
                    whether a chassis can carry it away. */}
                <div className="container-special-config">
                  <div className="container-special-title">Equipment</div>
                  <div className="container-special-options">
                    {EQUIPMENT.EXPORT.map(([key, label]) => (
                      <label className="container-special-option" key={key}>
                        <input
                          type="checkbox" checked={Boolean(s[key])}
                          onChange={(e) => setSlots((was) => was.map((x, n) =>
                            (n === i ? { ...x, [key]: e.target.checked } : x)))}
                        />
                        {" "}{label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Asked here when each line is stuffed somewhere of its own,
                    from the customer's saved locations only. */}
                {job.addressMode === "container" ? (
                  <div className="formgrid" style={{ gridColumn: "1 / -1" }}>
                    <Field label="Stuffing company" required>
                      <select value={s.stuffingCompany || ""} disabled={!customer}
                        onChange={(e) => setSlots((was) => was.map((x, n) =>
                          (n === i ? { ...x, stuffingCompany: e.target.value, stuffingAddress: "" } : x)))}>
                        <option value="">{!customer ? "Choose a customer first" : "Choose a company"}</option>
                        {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Stuffing address" required>
                      <select value={s.stuffingAddress || ""} disabled={!s.stuffingCompany}
                        onChange={(e) => setSlots((was) => was.map((x, n) =>
                          (n === i ? { ...x, stuffingAddress: e.target.value } : x)))}>
                        <option value="">Choose an address</option>
                        {addressesFor(s.stuffingCompany).map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </Field>
                  </div>
                ) : null}

                {REEFER.has(s.sizeType) ? (
                  <div className="export-reefer-config">
                    <div className="container-special-title">Reefer</div>
                    <div className="container-special-help">
                      A reefer collected on the wrong setting is a reefer that has to go back.
                    </div>
                    <div className="reefer-setting-grid">
                      <label>
                        <span className="field-label">Instruction</span>
                        <select
                          value={s.reeferMode}
                          onChange={(e) => setSlots((was) => was.map((x, n) => (n === i ? { ...x, reeferMode: e.target.value } : x)))}
                        >
                          <option value="">Choose</option>
                          <option value="PRE_COOL">Pre-cool</option>
                          <option value="PRE_SET">Pre-set at</option>
                        </select>
                      </label>
                      <label>
                        <span className="field-label">Temperature</span>
                        <select
                          value={s.reeferTemperature}
                          onChange={(e) => setSlots((was) => was.map((x, n) => (n === i ? { ...x, reeferTemperature: e.target.value } : x)))}
                        >
                          <option value="">Choose</option>
                          <option value="-18">−18 °C</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            <button
              type="button" className="btn secondary"
              onClick={() => setSlots((was) => [...was, { quantity: 1, sizeType: "20GP", reeferMode: "", reeferTemperature: "", heavyDuty: false, rated32_5: false }])}
            >
              + Another requirement
            </button>

            <div className="export-later-note">
              <b>The controller fills in later:</b> container number, seal, tare weight, VGM.
            </div>
          </section>
        ) : null}

        {/* ---- 4. permit -------------------------------------------------- */}
        {openTab === "sec-permit" && isImport ? (
          <section id="sec-permit" className="creation-section">
            <div className="creation-section-head">
              <div>
                <div className="section-title">Permit</div>
                <div className="muted">
                  {job.permitNumber
                    ? "Read from the permit. The file is stored on the job; containers carry the number."
                    : "Drop the permit at the top of this form and its number, expiry and vessel are read from it."}
                </div>
              </div>
              <label className="checkline">
                <input
                  type="checkbox" checked={job.permitRequired}
                  onChange={(e) => set({ permitRequired: e.target.checked })}
                />
                <span>This job needs a permit</span>
              </label>
            </div>

            {/* The demo's permit cards: number, expiry, vessel/voyage and the
                file, one card per permit, each covering every container or
                the ones ticked. Shown whenever the job needs a permit, so one
                can be typed in by hand as well as read from a document. */}
            {job.permitRequired ? (
              <>
                {permitCards.map((card, index) => {
                  const issues = cardIssues(card);
                  return (
                    <div className="container-entry" key={index}>
                      <div className="container-entry-head">
                        <b>Permit {index + 1}</b>
                        {index > 0 ? (
                          <button type="button" className="btn ghost"
                            onClick={() => {
                              delete permitFiles.current[index];
                              set({ extraPermits: job.extraPermits.filter((_, i) => i !== index - 1) });
                            }}>Remove</button>
                        ) : null}
                      </div>
                      <div className="job-create-grid">
                        <Field label="Permit number" filled={index === 0 ? filled.permitNumber : undefined}>
                          <input className="app-input" value={card.permitNumber ?? ""}
                            onChange={(e) => setCard(index, { permitNumber: shout(e.target.value) })} />
                        </Field>
                        <Field label="Expires" filled={index === 0 ? filled.permitExpiryDate : undefined}>
                          <input className="app-date-input" type="date" value={card.expiryDate ?? ""}
                            onChange={(e) => setCard(index, { expiryDate: e.target.value })} />
                        </Field>
                        <Field label="Permit vessel / voyage" filled={index === 0 ? filled.permitVesselVoyage : undefined}>
                          <input className="app-input" value={card.permitVesselVoyage ?? ""}
                            onChange={(e) => setCard(index, { permitVesselVoyage: shout(e.target.value) })} />
                        </Field>
                        <Field label="Permit file" hint={card.fileName || "PDF, JPG or PNG"}>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              if (file) permitFiles.current[index] = file; else delete permitFiles.current[index];
                              setCard(index, { fileName: file?.name ?? "" });
                            }} />
                        </Field>
                      </div>
                      <div className="action-row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        <button type="button" className={`btn ${card.scope !== "selected" ? "primary" : "secondary"}`}
                          onClick={() => setCard(index, { scope: "all" })}>Copy to All</button>
                        <button type="button" className={`btn ${card.scope === "selected" ? "primary" : "secondary"}`}
                          onClick={() => setCard(index, { scope: "selected" })}>Copy to Selected</button>
                      </div>
                      {card.scope === "selected" ? (
                        <div className="container-special-options" style={{ marginTop: 8 }}>
                          {rows.map((row, i) => (
                            <label className="container-special-option" key={i}>
                              <input type="checkbox" checked={(card.rows ?? []).includes(i)}
                                onChange={(e) => setCard(index, { rows: e.target.checked
                                  ? [...(card.rows ?? []), i] : (card.rows ?? []).filter((x) => x !== i) })} />
                              {" "}{row.containerNumber || `Container ${i + 1}`}
                            </label>
                          ))}
                        </div>
                      ) : null}
                      <div className="muted" style={{ marginTop: 6 }}>
                        Covers {card.scope === "selected"
                          ? `${(card.rows ?? []).length} of ${rows.length} container${rows.length === 1 ? "" : "s"}`
                          : `all ${rows.length} container${rows.length === 1 ? "" : "s"}`}.
                      </div>
                      {card.permitNumber ? (
                        issues.length ? (
                          <div className="permit-guidance warn" role="status">
                            <b>Requires attention</b>
                            {issues.map((issue) => <span key={issue}>{issue}</span>)}
                          </div>
                        ) : (
                          <div className="permit-guidance ok" role="status">
                            <b>Checks out</b>
                            <span>Number, expiry and vessel all agree with this shipment.</span>
                          </div>
                        )
                      ) : null}
                    </div>
                  );
                })}

                <div className="action-row" style={{ marginTop: 10 }}>
                  <button className="btn ghost" type="button"
                    onClick={() => set({ extraPermits: [...(job.extraPermits ?? []),
                      { permitNumber: "", expiryDate: "", permitVesselVoyage: "", fileName: "", scope: "all", rows: [] }] })}>
                    + Add Permit
                  </button>
                </div>
              </>
            ) : (
              <div className="muted">Permit not required for this job.</div>
            )}
          </section>
        ) : null}

        </div>

        {/* The page the fields came off, beside the fields.
            Kept mounted while it is hidden — `<object>` refetches and redraws
            a PDF from scratch every time it is remounted, and a controller
            toggling it twice should not wait twice. */}
        {sourceUrl ? (
          <aside className={`creation-source${showSource ? "" : " hidden"}`}>
            <div className="creation-source-head">
              <span className="creation-source-name" title={sourceName}>{sourceName}</span>
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn ghost">
                Open separately
              </a>
            </div>
            <object
              data={sourceUrl} type="application/pdf"
              className="creation-source-page"
              aria-label={`The document this job was read from: ${sourceName}`}
            >
              <div className="creation-source-fallback">
                This browser cannot show the document here. Use
                {" "}<a href={sourceUrl} target="_blank" rel="noreferrer">Open separately</a>
                {" "}while you check the fields.
              </div>
            </object>
          </aside>
        ) : null}
        </div>

        <div className="action-row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          {sourceUrl ? (
            <button
              className="btn ghost" type="button"
              style={{ marginRight: "auto" }}
              onClick={() => setShowSource((was) => !was)}
              aria-pressed={showSource}
            >
              {showSource ? "Hide the document" : "Show the document"}
            </button>
          ) : null}
          <button className="btn secondary" type="button" onClick={onCancel}>Cancel</button>
          <button
            className="btn secondary" type="submit" disabled={busy}
            onClick={() => setAgain(true)}
          >
            Create &amp; add another
          </button>
          <button
            className="btn primary" type="submit" disabled={busy}
            onClick={() => setAgain(false)}
          >
            {busy ? "Creating…" : "Create job"}
          </button>
        </div>
      </form>
    </div></div>
  );
}
