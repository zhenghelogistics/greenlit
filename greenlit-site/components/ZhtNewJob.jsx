"use client";

import { useEffect, useRef, useState } from "react";
import { checkPermit } from "@greenlit/engine";
import { jobFromDocument, EMPTY_ROW } from "../lib/new-job-from-document.mjs";

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
const HEAVY_SIZES = new Set(["40HQ", "40RF"]);

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
      {sections.map((section) => (
        <button
          key={section.id} type="button"
          className={`import-create-tab${current === section.id ? " current" : ""}`}
          aria-current={current === section.id ? "true" : undefined}
          onClick={() => onJump(section.id)}
        >
          <span>{section.label}</span>
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

export default function ZhtNewJob({ customers = [], onCreate, onCancel, nextJobNumber, onCustomerChosen }) {
  const [type, setType] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  /** Which fields the document filled, so the form can say so. */
  const [filled, setFilled] = useState({});
  const [reading, setReading] = useState("");
  const [noaNote, setNoaNote] = useState("");
  /** What the notice said the delivery address was. Shown, never applied. */
  const [readAddress, setReadAddress] = useState("");

  const form = useRef(null);
  const [job, setJob] = useState({
    customerCode: "", pic: "",
    addressMode: "job", deliveryCompany: "", deliveryAddress: "",
    vesselName: "", voyageNumber: "", etaDate: "", etaTime: "",
    carrier: "", blNumber: "", houseBlNumber: "",
    permitRequired: false, remarks: "",
    // What the site always needs, and what this one delivery needs instead.
    // Kept apart so an override is visibly an override rather than an edit to
    // the customer master made by accident from a job form.
    deliveryInstructions: "",
    permitNumber: "", permitExpiryDate: "", permitVesselVoyage: "",
    // export only
    bookingReference: "", exportClearanceReference: "", shipper: "",
    emptyCollectionYard: "", cmsStatus: "PENDING",
    emptyCollectionDate: "", emptyCollectionTime: "",
    class2S: false, class2C: false,
  });

  const set = (patch) => setJob((was) => ({ ...was, ...patch }));

  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [slots, setSlots] = useState([{ quantity: 1, sizeType: "20GP", reeferMode: "", reeferTemperature: "" }]);

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
  const [sourceName, setSourceName] = useState("");
  const [showSource, setShowSource] = useState(true);

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);

  const keepSource = (file) => {
    setSourceUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : "";
    });
    setSourceName(file?.name ?? "");
  };

  const customer = customers.find((c) => c.code === job.customerCode);

  /**
   * The chosen customer's saved locations, fetched when they are chosen.
   *
   * This read `customer.locations`, and nothing has ever put a `locations`
   * array on a customer — `/api/customers` returns the customer record and the
   * addresses live in their own table behind `/api/customers/:code/locations`.
   * So the list was always empty, the Delivery company picker had nothing in
   * it, no address could be chosen, and no import job could be created at all.
   *
   * Fetched per customer rather than all of them up front: the master holds
   * every address of every customer, and a form needs one customer's.
   */
  //
  // Held with the customer it was fetched for, rather than as a bare list that
  // is cleared on the way out. Two reasons, and the second is the real one:
  // clearing it is a setState during render, which cascades; and a bare list
  // shows the previous customer's addresses for as long as the next fetch
  // takes, which is exactly long enough for somebody to pick one.
  const [loaded, setLoaded] = useState({ code: "", locations: [] });
  const fresh = loaded.code === job.customerCode;

  useEffect(() => {
    if (!job.customerCode) return undefined;
    let cancelled = false;
    fetch(`/api/customers/${encodeURIComponent(job.customerCode)}/locations`)
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => {
        if (!cancelled) setLoaded({ code: job.customerCode, locations: d.locations ?? [] });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ code: job.customerCode, locations: [] });
      });
    return () => { cancelled = true; };
  }, [job.customerCode]);

  const loadingLocations = Boolean(job.customerCode) && !fresh;
  const usable = (fresh ? loaded.locations : []).filter((l) => l.active !== false);
  const companies = [...new Set(usable.map((l) => l.company).filter(Boolean))];
  const addressesFor = (company) =>
    usable.filter((l) => l.company === company).map((l) => l.address).filter(Boolean);
  /** The site behind a chosen address, for its standing instructions. */
  const siteAt = (company, address) =>
    usable.find((l) => l.company === company && l.address === address) ?? null;

  const setRow = (i, patch) =>
    setRows((was) => was.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  /**
   * Copy one field from one container to the others.
   *
   * The empty return yard and the carrier's free time are the same for every
   * box on a bill of lading far more often than not, and typing them eleven
   * times is how they end up inconsistent.
   */
  const spread = (i, keys) =>
    setRows((was) => was.map((r, n) => (n === i ? r : { ...r, ...Object.fromEntries(keys.map((k) => [k, was[i][k]])) })));

  function validate() {
    if (!job.customerCode) return ["sec-customer", "Choose a customer."];
    if (job.addressMode === "job" && !job.deliveryAddress) {
      return ["sec-customer", "Choose the delivery address, or switch to asking per container."];
    }
    if (type === "IMPORT") {
      if (!job.vesselName) return ["sec-shipment", "Enter the vessel."];
      if (!job.blNumber) return ["sec-shipment", "Enter the master bill of lading."];
      if (job.addressMode === "container" && rows.some((r) => !r.deliveryAddress)) {
        return ["sec-containers", "Every container needs a delivery address."];
      }
    } else {
      if (!job.bookingReference) return ["sec-shipment", "Enter the booking reference."];
      if (!job.emptyCollectionYard) return ["sec-shipment", "Enter the empty collection yard."];
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
    if (failure) { setProblem(failure[1]); setTab(failure[0]); return; }

    setBusy(true);
    setProblem("");
    const when = (d, t) => (d ? (t ? `${d}T${t}` : d) : null);

    const draft = type === "IMPORT"
      ? {
          customerCode: job.customerCode,
          blNumber: shout(job.blNumber) || null,
          houseBlNumber: shout(job.houseBlNumber) || null,
          vesselName: shout(job.vesselName) || null,
          voyageNumber: shout(job.voyageNumber) || null,
          eta: when(job.etaDate, job.etaTime),
          deliveryAddress: job.addressMode === "job" ? job.deliveryAddress : null,
          permitRequired: job.permitRequired,
          permitNumber: shout(job.permitNumber) || null,
          permitExpiryDate: job.permitExpiryDate || null,
          permitVesselVoyage: shout(job.permitVesselVoyage) || null,
          containers: rows.map((r) => ({
            containerNumber: shout(r.containerNumber) || null,
            sizeType: r.sizeType || null,
            grossWeight: r.grossWeight === "" ? null : Number(r.grossWeight),
            freeTimeModel: r.freeTimeModel,
            combinedFreeDays: r.combinedFreeDays === "" ? null : Number(r.combinedFreeDays),
            demurrageFreeDays: r.demurrageFreeDays === "" ? null : Number(r.demurrageFreeDays),
            detentionFreeDays: r.detentionFreeDays === "" ? null : Number(r.detentionFreeDays),
          })),
        }
      : {
          customerCode: job.customerCode,
          shipper: shout(job.shipper) || null,
          bookingReference: shout(job.bookingReference) || null,
          exportClearanceReference: shout(job.exportClearanceReference) || null,
          vesselName: shout(job.vesselName) || null,
          voyageNumber: shout(job.voyageNumber) || null,
          etaSingapore: when(job.emptyCollectionDate, job.emptyCollectionTime),
          emptyCollectionYard: shout(job.emptyCollectionYard) || null,
          containerQuantity: slots.reduce((n, s) => n + Number(s.quantity || 0), 0),
          containerSizeType: slots[0]?.sizeType ?? null,
        };

    try {
      await onCreate(type, draft, { stayHere: again });
      if (again) {
        set({
          vesselName: "", voyageNumber: "", blNumber: "", houseBlNumber: "",
          bookingReference: "", exportClearanceReference: "", remarks: "",
        });
        setRows([{ ...EMPTY_ROW }]);
        setNoaNote("");
        setFilled({});
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
  const permitIssues = job.permitNumber
    ? checkPermit(
        {
          permitId: "draft", permitNumber: job.permitNumber,
          expiryDate: job.permitExpiryDate || null,
          permitVesselVoyage: job.permitVesselVoyage || null,
          fileName: null, linkedContainerIds: [],
        },
        {
          vesselName: job.vesselName || null,
          voyageNumber: job.voyageNumber || null,
          eta: job.etaDate || null,
        },
      ).issues
    : [];

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
        : !job.bookingReference || !job.emptyCollectionYard,
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
  function applyDocument(read, fileName) {
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
                    set({ customerCode: e.target.value, deliveryCompany: "", deliveryAddress: "" });
                    // The reference is the customer's next one, so it can only
                    // be previewed once there is a customer.
                    onCustomerChosen?.(e.target.value);
                  }}
                >
                  <option value="">Choose a customer</option>
                  {customers.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
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
              <Field label="Voyage">
                <input value={job.voyageNumber} onChange={(e) => set({ voyageNumber: shout(e.target.value) })} />
              </Field>

              {isImport ? (
                <>
                  <WhenField
                    label="Vessel ETA" date={job.etaDate} time={job.etaTime}
                    onDate={(v) => set({ etaDate: v })} onTime={(v) => set({ etaTime: v })}
                  />
                  <Field label="Carrier">
                    <input value={job.carrier} onChange={(e) => set({ carrier: shout(e.target.value) })} />
                  </Field>
                  <Field label="Master bill of lading" required>
                    <input value={job.blNumber} onChange={(e) => set({ blNumber: shout(e.target.value) })} />
                  </Field>
                  <Field label="House bill of lading">
                    <input value={job.houseBlNumber} onChange={(e) => set({ houseBlNumber: shout(e.target.value) })} />
                  </Field>
                  <Field label="Permit">
                    <select
                      value={job.permitRequired ? "yes" : "no"}
                      onChange={(e) => set({ permitRequired: e.target.value === "yes" })}
                    >
                      <option value="no">Not required by this customer</option>
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
                  <Field label="Empty collection yard" required>
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

              <label className="field-wrap full">
                <span className="field-label">Remarks<span className="optional-label"> Optional</span></span>
                {/* Not shouted: a remark is a sentence somebody wrote to be read. */}
                <textarea value={job.remarks} onChange={(e) => set({ remarks: e.target.value })} />
              </label>
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
                  <Field label="Container number">
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

                  {HEAVY_SIZES.has(r.sizeType) ? (
                    <div className="container-special-config">
                      <div className="container-special-title">Equipment</div>
                      <div className="container-special-help">
                        Asked rather than assumed: a tri-axle that was needed and not
                        booked is a truck that turns up and cannot load.
                      </div>
                      <div className="container-special-options">
                        <label className="container-special-option">
                          <input type="checkbox" checked={r.heavyDuty} onChange={(e) => setRow(i, { heavyDuty: e.target.checked })} /> Heavy duty
                        </label>
                        <label className="container-special-option">
                          <input type="checkbox" checked={r.rated32_5} onChange={(e) => setRow(i, { rated32_5: e.target.checked })} /> 32.5 tonnes
                        </label>
                        <label className="container-special-option">
                          <input type="checkbox" checked={r.triAxle} onChange={(e) => setRow(i, { triAxle: e.target.checked })} /> Tri-axle
                        </label>
                      </div>
                    </div>
                  ) : null}

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
                    {rows.length > 1 ? (
                      <button
                        type="button" className="btn ghost" style={{ marginTop: 6 }}
                        onClick={() => spread(i, ["emptyReturnYard"])}
                      >Copy to the other {rows.length - 1}</button>
                    ) : null}
                  </div>

                  <Field label="Free time">
                    <select
                      value={r.freeTimeModel}
                      onChange={(e) => setRow(i, { freeTimeModel: e.target.value })}
                    >
                      <option value="COMBINED">One combined allowance</option>
                      <option value="SPLIT">Separate demurrage and detention</option>
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
                    <div className="field-wrap full">
                      <button
                        type="button" className="btn ghost"
                        onClick={() => spread(i, ["freeTimeModel", "combinedFreeDays", "demurrageFreeDays", "detentionFreeDays"])}
                      >Copy this free time to the other {rows.length - 1}</button>
                    </div>
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
              onClick={() => setSlots((was) => [...was, { quantity: 1, sizeType: "20GP", reeferMode: "", reeferTemperature: "" }])}
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

            {job.permitNumber ? (
              <>
                <div className="job-create-grid">
                  <Field label="Permit number" filled={filled.permitNumber}>
                    <input
                      className="app-input" value={job.permitNumber}
                      onChange={(e) => set({ permitNumber: shout(e.target.value) })}
                    />
                  </Field>
                  <Field label="Expires" filled={filled.permitExpiryDate}>
                    <input
                      className="app-date-input" type="date" value={job.permitExpiryDate}
                      onChange={(e) => set({ permitExpiryDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Declared against" filled={filled.permitVesselVoyage}>
                    <input
                      className="app-input" value={job.permitVesselVoyage}
                      onChange={(e) => set({ permitVesselVoyage: shout(e.target.value) })}
                    />
                  </Field>
                </div>

                {/* The same three checks the engine runs after the job exists,
                    run here — so a permit for the wrong sailing is caught while
                    the person who can fix it is still looking at the form,
                    rather than at the gate. They warn; none of them refuses. */}
                {permitIssues.length ? (
                  <div className="permit-guidance warn" role="status">
                    <b>Worth checking before you create this</b>
                    {permitIssues.map((issue) => <span key={issue}>{issue}</span>)}
                  </div>
                ) : (
                  <div className="permit-guidance ok" role="status">
                    <b>Checks out</b>
                    <span>Number, expiry and vessel all agree with this shipment.</span>
                  </div>
                )}
              </>
            ) : null}
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
