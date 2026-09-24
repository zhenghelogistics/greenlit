"use client";

import { useState } from "react";

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

function Tabs({ tabs, active, onPick }) {
  return (
    <div className="import-create-tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button
          key={id} type="button" role="tab" aria-selected={active === id}
          className={`import-create-tab${active === id ? " active" : ""}`}
          onClick={() => onPick(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, required, hint, children }) {
  // The label wraps its control rather than pointing at an id: one element, no
  // id to keep unique across eleven container rows, and it stays associated
  // however the rows are reordered.
  return (
    <label className="field-wrap">
      <span className="field-label">
        {label}{required ? <span className="req"> *</span> : <span className="optional-label"> Optional</span>}
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

export default function ZhtNewJob({ customers = [], onCreate, onCancel, onUseDocument }) {
  const [type, setType] = useState(null);
  const [tab, setTab] = useState("customer");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const [job, setJob] = useState({
    customerCode: "", pic: "",
    addressMode: "job", deliveryCompany: "", deliveryAddress: "",
    vesselName: "", voyageNumber: "", etaDate: "", etaTime: "",
    carrier: "", blNumber: "", houseBlNumber: "",
    permitRequired: false, remarks: "",
    // export only
    bookingReference: "", exportClearanceReference: "", shipper: "",
    emptyCollectionYard: "", cmsStatus: "PENDING",
    emptyCollectionDate: "", emptyCollectionTime: "",
    class2S: false, class2C: false,
  });

  const set = (patch) => setJob((was) => ({ ...was, ...patch }));

  const [rows, setRows] = useState([
    { containerNumber: "", sizeType: "", grossWeight: "", deliveryDate: "", deliveryTime: "",
      emptyReturnYard: "", freeTimeModel: "COMBINED", combinedFreeDays: "",
      demurrageFreeDays: "", detentionFreeDays: "",
      deliveryCompany: "", deliveryAddress: "",
      heavyDuty: false, rated32_5: false, triAxle: false },
  ]);
  const [slots, setSlots] = useState([{ quantity: 1, sizeType: "20GP", reeferMode: "", reeferTemperature: "" }]);

  const customer = customers.find((c) => c.code === job.customerCode);
  const locations = (customer?.locations ?? []).filter((l) => l.active !== false);
  const companies = [...new Set(locations.map((l) => l.company).filter(Boolean))];
  const addressesFor = (company) =>
    locations.filter((l) => l.company === company).map((l) => l.address).filter(Boolean);

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
    if (!job.customerCode) return ["customer", "Choose a customer."];
    if (job.addressMode === "job" && !job.deliveryAddress) {
      return ["customer", "Choose the delivery address, or switch to asking per container."];
    }
    if (type === "IMPORT") {
      if (!job.vesselName) return ["shipment", "Enter the vessel."];
      if (!job.blNumber) return ["shipment", "Enter the master bill of lading."];
      if (job.addressMode === "container" && rows.some((r) => !r.deliveryAddress)) {
        return ["containers", "Every container needs a delivery address."];
      }
    } else {
      if (!job.bookingReference) return ["shipment", "Enter the booking reference."];
      if (!job.emptyCollectionYard) return ["shipment", "Enter the empty collection yard."];
      if (slots.some((s) => REEFER.has(s.sizeType) && (!s.reeferMode || !s.reeferTemperature))) {
        return ["containers", "A reefer needs its instruction and temperature."];
      }
    }
    return null;
  }

  async function submit(event) {
    event.preventDefault();
    const failure = validate();
    if (failure) { setTab(failure[0]); setProblem(failure[1]); return; }

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
      await onCreate(type, draft);
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
              Import and export are different pieces of work, not one form with a switch.
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
  const tabs = isImport
    ? [["customer", "1. Customer & delivery"], ["shipment", "2. Shipment"],
       ["containers", "3. Containers"], ["permit", "4. Permit"]]
    : [["customer", "1. Customer & delivery"], ["shipment", "2. Shipment"],
       ["containers", "3. Containers"]];

  return (
    <div className="zht"><div className="content">
      <form onSubmit={submit}>
        <div className="creation-workspace-head">
          <button type="button" className="btn ghost" onClick={() => setType(null)}>
            ← Change direction
          </button>
          <div className={`creation-type-badge ${isImport ? "import" : "export"}`}>
            {isImport ? "IMPORT JOB" : "EXPORT JOB"}
          </div>
        </div>

        <Tabs tabs={tabs} active={tab} onPick={setTab} />

        {problem ? (
          <div className="callout" role="alert" style={{ marginBottom: 14 }}>{problem}</div>
        ) : null}

        {/* ---- 1. customer & delivery ------------------------------------ */}
        {tab === "customer" ? (
          <section className="creation-section">
            <div className="creation-section-head">
              <div>
                <div className="section-title">Customer &amp; delivery</div>
                <div className="muted">
                  Destinations come from the customer master. Add a location there first
                  if it is missing — a typed address is one nobody can plan against twice.
                </div>
              </div>
            </div>
            <div className="formgrid job-create-grid">
              <Field label="Customer" required>
                <select
                  value={job.customerCode}
                  onChange={(e) => set({ customerCode: e.target.value, deliveryCompany: "", deliveryAddress: "" })}
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
                    onClick={() => set({ addressMode: "job" })}
                  >
                    <b>One address for the job</b>
                    <span>Every container goes to the same place. Most jobs.</span>
                  </button>
                  <button
                    type="button"
                    className={`delivery-mode-btn${job.addressMode === "container" ? " active" : ""}`}
                    onClick={() => set({ addressMode: "container" })}
                  >
                    <b>Ask for each container</b>
                    <span>The job splits across more than one place.</span>
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
                      <option value="">{customer ? "Choose a company" : "Choose a customer first"}</option>
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
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ---- 2. shipment ----------------------------------------------- */}
        {tab === "shipment" ? (
          <section className="creation-section">
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

            {/* The accelerator, offered rather than imposed. Reading the notice
                fills every field below it, so somebody holding the PDF should
                not be typing — but somebody who has the details on the phone
                and no document yet should not be sent away to find one. */}
            {isImport ? (
              <div className="permit-guidance" style={{ marginBottom: 14 }}>
                <b>Have the arrival notice?</b>
                <span>
                  Reading it fills the vessel, the ETA, the bills of lading and every
                  container.{" "}
                  <button type="button" className="btn ghost" onClick={onUseDocument}>
                    Upload it instead
                  </button>
                </span>
              </div>
            ) : null}
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
                    hint="Chased against the empty collection date, not the vessel — the empty is usually wanted weeks earlier."
                  >
                    <select value={job.cmsStatus} onChange={(e) => set({ cmsStatus: e.target.value })}>
                      <option value="PENDING">Pending</option>
                      <option value="COMPLETED">Done</option>
                      <option value="NOT_REQUIRED">Not required</option>
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
        {tab === "containers" && isImport ? (
          <section className="creation-section">
            <div className="creation-section-head">
              <div>
                <div className="section-title">Containers</div>
                <div className="muted">
                  One row per box. The yard and the free time can be copied across
                  once — they are the same for every container on a bill far more
                  often than not.
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
                          <option value="">Choose a company</option>
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

        {tab === "containers" && !isImport ? (
          <section className="creation-section">
            <div className="creation-section-head">
              <div>
                <div className="section-title">Containers</div>
                <div className="muted">
                  How many, and of what. Numbers, seals and tare weights are filled in
                  by the controller after collection — nobody knows them yet.
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
        {tab === "permit" && isImport ? (
          <section className="creation-section">
            <div className="creation-section-head">
              <div>
                <div className="section-title">Permit</div>
                <div className="muted">
                  {job.permitRequired
                    ? "Upload and allocate the permit from the job once it is created — the file is stored once and containers carry only its number."
                    : "This customer does not require one. Change it on the shipment tab if that is wrong."}
                </div>
              </div>
            </div>
            {job.permitRequired ? (
              <div className="permit-guidance">
                <b>Why not here</b>
                <span>
                  A permit is checked against the vessel and the ETA, and both are
                  easier to get right once the job exists and the notice has been read.
                </span>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="action-row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create job"}
          </button>
        </div>
      </form>
    </div></div>
  );
}
