"use client";

import { useEffect, useState } from "react";
import { IMPORT_CONTAINER_STATUS, EXPORT_JOB_STATUS, DATE_AMENDMENT_REASON } from "@greenlit/engine";

/**
 * The job detail screen, in the PM's markup.
 *
 * Same split as the dashboard: the layout, class names and visual language are
 * his, and every value on it is the engine's.
 *
 * Two of his renderers are deliberately not ported. `renderNextAction` decides
 * what to do next from a chain of `if (status === ...)` in the browser, and
 * `renderTimeline` walks a hardcoded flow array. Both of those are §31's job
 * and already exist server-side — `nextActionRequired` and `blockingReason`
 * come off the rules engine with the precedence §31.2 sets out, which a
 * sequence of ifs cannot reproduce. So the panels keep his shape and read our
 * answers.
 */

/** §32.1. The flow a container actually walks, minus the states that are exits. */
const NOT_STEPS = new Set(["On Hold", "Cancelled", "Exception", "New", "New Export Job"]);
const flowFor = (type) =>
  (type === "Export" ? EXPORT_JOB_STATUS : IMPORT_CONTAINER_STATUS).filter((s) => !NOT_STEPS.has(s));

function formatDay(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * §42. Tell the customer the container's number, and record that we did.
 *
 * The three facts are shown, never retyped: "the notification is generated
 * from stored job data". A controller copying a container number by hand is
 * how a customer seals against the wrong box.
 */
function SendDetails({ container, customer, onSend }) {
  const [sentTo, setSentTo] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSend({ sentTo, reference });
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card" style={{ marginTop: 12, padding: 12 }}>
      <div className="section-title">Send container details to {customer || "the customer"}</div>
      <div className="muted">
        Until this is sent the customer does not know which container is theirs
        and cannot begin stuffing.
      </div>
      <div className="fieldgrid" style={{ marginTop: 8 }}>
        <div className="field"><span className="field-label">Container</span><b>{container.number || "—"}</b></div>
        <div className="field"><span className="field-label">Seal</span><b>{container.seal || "—"}</b></div>
        <div className="field"><span className="field-label">Tare</span><b>{container.tare ?? "—"}</b></div>
      </div>
      <div className="formgrid" style={{ marginTop: 8 }}>
        <div className="field">
          <label htmlFor="zht-send-to">Send to</label>
          <input id="zht-send-to" type="email" required value={sentTo}
            onChange={(e) => setSentTo(e.target.value)} placeholder="ops@customer.com.sg" />
        </div>
        <div className="field">
          <label htmlFor="zht-send-ref">Message reference (optional)</label>
          <input id="zht-send-ref" value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder="Email subject or message id" />
        </div>
      </div>
      <button className="btn primary" type="submit" disabled={busy || !sentTo.trim()}
        style={{ marginTop: 10 }}>
        {busy ? "Recording…" : "Record details sent"}
      </button>
    </form>
  );
}

/**
 * A section that is closed until somebody wants it.
 *
 * `count` is the point: a closed section that might contain three outstanding
 * movements and looks identical to one containing none is worse than no
 * section at all. The number is always on the header, and it carries a word
 * with it rather than relying on the pill's shade — §Accessibility: colour is
 * never the only indicator.
 */
function Drawer({ title, count, children, open = false }) {
  const has = typeof count === "number" && count > 0;
  return (
    <details className="drawer" open={open}>
      <summary>
        {title}
        {typeof count === "number" ? (
          <span className="drawer-count" data-has={has ? "yes" : "no"}>
            {has ? `${count} item${count === 1 ? "" : "s"}` : "none"}
          </span>
        ) : null}
      </summary>
      <div className="drawer-body">{children}</div>
    </details>
  );
}

/**
 * What is costing money or stopping work, at the top and nowhere else.
 *
 * His layout gives "3 days over free time" the same weight as the container
 * size, six fields into a grid. One of those is a meter running and the other
 * will still be true tomorrow.
 *
 * Nothing decorative gets in here. If a job is healthy the band does not
 * render, so its presence alone means something is wrong.
 */
function Alarms({ container }) {
  const alarms = [];

  for (const clock of container?.freeTime ?? []) {
    if (clock.standing === "OVERDUE") {
      alarms.push({
        money: true,
        what: `${clock.label}: ${clock.summary}`,
        why: container.charge?.amount != null
          ? `Estimated ${container.charge.currency} ${container.charge.amount.toFixed(2)} so far`
          : "No daily rate on file, so the cost is not yet known",
      });
    } else if (clock.standing === "LAST_DAY" || clock.standing === "DUE_SOON") {
      alarms.push({ what: `${clock.label}: ${clock.summary}`, why: "Return or clear before it starts charging" });
    }
  }

  // Permits, Portnet and missing fields used to be repeated here. They are
  // steps on the journey above, and saying them twice was how one fact became
  // three cards. This band is money only.

  if (!alarms.length) return null;
  return (
    <div className="alarms">
      {alarms.map((a, i) => (
        <div className={`alarm${a.money ? " alarm--money" : ""}`} key={i}>
          <span className="alarm-what">{a.what}</span>
          <span className="alarm-why">{a.why}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * §31, §32. The job as the trip the box makes.
 *
 * One line, read top to bottom, with each step saying where it stands and
 * carrying its own action. The alternative — which this replaces — was a set
 * of panels that left the reader to assemble the sequence themselves.
 *
 * The state is on the node's shape as well as its colour, so the sequence
 * survives a colourblind reader.
 */
const DO_LABEL = {
  "job.edit": "Fill it in",
  "portnet.confirm": "Mark released",
  "permit.confirm": "Add permit",
  "movement.create": "Plan movement",
  "movement.update": "Update trip",
  "job.close": "Close job",
  "cms.record": "Record CMS",
  "container.capture": "Capture details",
  "container.notify": "Send to customer",
  "readiness.record": "Mark ready",
  "vgm.record": "Record VGM",
  "transhipment.record": "Set transhipment",
};

function Journey({ steps, onAct }) {
  if (!steps.length) return null;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="section-title">Where this job is</div>
      <div className="journey">
        {steps.map((s) => (
          <div className={`leg leg--${s.state.toLowerCase()}`} key={s.id}>
            {/* The mark is drawn in CSS: it is presentation, and the
                state is already said in words beside it. */}
            <div className="leg-node" aria-hidden="true" />
            <div>
              <div className="leg-label">
                {s.label}
                {/* Colour and shape both carry the state, so the word is here
                    too — nothing is said by appearance alone. */}
                <span className="gl-caption" style={{ marginLeft: 8, fontWeight: 500 }}>
                  {s.state === "CURRENT" ? "now"
                    : s.state === "WAITING" ? "waiting on them"
                      : s.state === "BLOCKED" ? "blocked"
                        : s.state === "SKIPPED" ? "not needed"
                          : s.state === "DONE" ? "done" : ""}
                </span>
              </div>
              <div className="leg-detail">{s.detail}</div>
            </div>
            <div className="leg-do">
              {s.action ? (
                <button className={`btn ${s.state === "CURRENT" ? "primary" : "secondary"}`}
                  type="button" onClick={() => onAct(s.action)}>
                  {DO_LABEL[s.action] ?? "Open"}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * §13.1. Moving a date, with the reason attached.
 *
 * The audit stream records that a date changed and who changed it, and has
 * nowhere to say why. Why is the whole content of the conversation a
 * controller has when the customer rings — "the vessel slipped two days" is a
 * different call from "they asked us to hold it" — so the reason is asked for
 * at the point of the change rather than reconstructed afterwards.
 *
 * Append-only: a wrong entry is corrected by another amendment, never by
 * editing the first. So there is no edit control here, by design.
 */
function DateAmendments({ jobId, eta }) {
  const [log, setLog] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ dateField: "vesselEta", newValue: "", reasonCode: "VESSEL_DELAY", reasonNote: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!jobId) return;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/date-amendments`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setLog(d.amendments ?? []))
      .catch(() => setLog([]));
  };
  useEffect(load, [jobId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/date-amendments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    setBusy(false);
    if (!response?.ok) { setError(payload?.error ?? "That amendment was not recorded."); return; }
    setOpen(false);
    setForm((f) => ({ ...f, newValue: "", reasonNote: "" }));
    load();
  }

  const entries = log ?? [];
  return (
    <Drawer title="Date changes" count={entries.length}>
      {error ? <div className="callout">{error}</div> : null}

      {open ? (
        <form onSubmit={submit} className="card" style={{ marginBottom: 10, padding: 12 }}>
          <div className="formgrid">
            <div className="field">
              <label htmlFor="zht-dt-field">Which date</label>
              <select id="zht-dt-field" value={form.dateField} onChange={set("dateField")}>
                <option value="vesselEta">Vessel ETA</option>
                <option value="deliveryDate">Delivery date</option>
                <option value="emptyReturnDueDate">Empty return due</option>
                <option value="truckInDate">Truck in</option>
                <option value="truckOutDate">Truck out</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="zht-dt-value">New date</label>
              <input id="zht-dt-value" type="date" required value={form.newValue} onChange={set("newValue")} />
            </div>
            <div className="field">
              <label htmlFor="zht-dt-reason">Why</label>
              <select id="zht-dt-reason" value={form.reasonCode} onChange={set("reasonCode")}>
                {DATE_AMENDMENT_REASON.map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>
          {/* §13.1. OTHER without a note is a reason code that says nothing. */}
          {form.reasonCode === "OTHER" ? (
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="zht-dt-note">What happened</label>
              <input id="zht-dt-note" required value={form.reasonNote} onChange={set("reasonNote")} />
            </div>
          ) : null}
          <div className="action-row" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Recording…" : "Record the change"}
            </button>
            <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn secondary" type="button" onClick={() => setOpen(true)}>
          Move a date
        </button>
      )}

      <div style={{ marginTop: 10 }}>
        {entries.length ? entries.map((a) => (
          <div className="movement" key={a.amendmentId}>
            <strong>{a.dateField}</strong>
            {formatDay(a.previousValue) } → {formatDay(a.newValue)}
            <br />
            <span className="muted">
              {String(a.reasonCode).replace(/_/g, " ").toLowerCase()}
              {a.reasonNote ? ` · ${a.reasonNote}` : ""} · {a.amendedBy}
            </span>
          </div>
        )) : (
          <span className="muted">
            {log === null ? "Loading…" : `No date has been moved. ETA stands at ${formatDay(eta)}.`}
          </span>
        )}
      </div>
    </Drawer>
  );
}


/**
 * The handover from operations to the controller.
 *
 * His panel, and his four states per container, because the shape is right: a
 * count at the top, then one line per box saying either that it has gone or
 * exactly what is holding it.
 *
 * The distinction the four states draw is the useful part. "Waiting for
 * shipment information" is not the same as "Missing: Permit" — the first is
 * somebody else's job and the second is this container's — and a single
 * "incomplete" would collapse them into a line nobody can act on.
 */
function Handover({ job, onHandOver }) {
  const containers = job.containers ?? [];
  const shipmentGaps = job.handoverShipmentGaps ?? [];
  const handed = containers.filter((c) => c.handedOverAt).length;
  const ready = containers.filter(
    (c) => !c.handedOverAt && shipmentGaps.length === 0 && (c.handoverGaps ?? []).length === 0,
  ).length;
  const total = containers.length;
  const done = total > 0 && handed === total;

  return (
    <div
      className="card"
      style={{
        marginBottom: 18,
        borderColor: done ? "var(--gl-state-ready)" : "var(--gl-state-warn)",
      }}
    >
      <div className="header-row" style={{ marginBottom: 10 }}>
        <div>
          <div className="section-title">Controller handover</div>
          <div className="muted">
            What the controller needs to start. Shorter than the job&rsquo;s missing
            information on purpose &mdash; the rest arrives while the box is already
            on their board.
          </div>
        </div>
        <span className="tag" style={{ whiteSpace: "nowrap" }}>
          {handed}/{total} handed over{ready ? ` · ${ready} ready` : ""}
        </span>
      </div>

      {shipmentGaps.length > 0 ? (
        <div className="stop" style={{ borderLeft: "4px solid var(--gl-state-warn)" }}>
          <b>Shipment</b> — missing {shipmentGaps.join(", ")}
          <div className="muted">
            This holds every container on the job, so it is worth doing first.
          </div>
        </div>
      ) : null}

      {containers.length === 0 ? (
        <div className="muted">No containers on this job yet.</div>
      ) : null}

      {containers.map((c, i) => {
        const own = c.handoverGaps ?? [];
        const label = c.number || `Container ${i + 1}`;

        if (c.handedOverAt) {
          return (
            <div className="stop" key={c.id ?? i}>
              <b>{label}</b> — <span style={{ color: "var(--gl-state-ready-ink)", fontWeight: 600 }}>
                handed over
              </span>
              <div className="muted">
                {formatDay(c.handedOverAt)}{c.handedOverBy ? ` · ${c.handedOverBy}` : ""}
              </div>
            </div>
          );
        }

        // The shipment's gap is named once at the top; repeating it on every
        // container buries the container's own problem underneath it.
        if (shipmentGaps.length > 0) {
          return (
            <div className="stop" key={c.id ?? i}>
              <b>{label}</b> — waiting on the shipment
              {own.length > 0 ? <div className="muted">Also missing {own.join(", ")}</div> : null}
            </div>
          );
        }

        if (own.length > 0) {
          return (
            <div className="stop" key={c.id ?? i}>
              <b>{label}</b> — missing {own.join(", ")}
            </div>
          );
        }

        return (
          <div
            className="stop"
            key={c.id ?? i}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
          >
            <div><b>{label}</b> — ready for handover</div>
            <button
              className="btn primary"
              type="button"
              onClick={() => onHandOver?.(c)}
            >
              Hand to controller
            </button>
          </div>
        );
      })}
    </div>
  );
}

const Field = ({ label, value }) => (
  <div className="field"><span className="field-label">{label}</span><b>{value || "—"}</b></div>
);

export default function ZhtJobDetail({
  job, containerIndex = 0, onSelectContainer, onBack, onManage,
  onRecordCms, onSendDetails, onSetTranshipment, onRecordDetails, onHandOver, extras, permitPanel,
}) {
  /** Opened by the journey's closing step, and by hand otherwise. */
  const [showClosing, setShowClosing] = useState(false);
  /** §42. Brings the notification form into view from the journey's step. */
  const [showNotify, setShowNotify] = useState(false);

  // After the hook: hooks must run in the same order on every render, and an
  // early return above one is how that order changes between renders.
  if (!job) return null;

  const containers = job.containers ?? [];
  const container = containers[containerIndex] ?? containers[0] ?? {};
  const flow = flowFor(job.type);
  const stepIndex = Math.max(0, flow.indexOf(container.status ?? container.state));

  const shipment = [
    ["Customer", job.customer],
    ["Type", job.type],
    ["Master B/L", job.billOfLading],
    ["House B/L", job.houseBillOfLading],
    ["Booking", job.booking],
    ["Vessel / Voyage", job.vessel],
    ["ETA", formatDay(job.eta)],
    ["Terminal", job.terminal],
    ["Delivery Address", job.deliveryAddress],
    ["Empty Yard", job.emptyYard],
    ["CMS", job.cmsCompleted ? "Completed" : "Pending"],
  ];

  const containerFields = [
    ["Container", container.number],
    ["Seal", container.seal],
    ["Size / Type", container.sizeType],
    ["Weight (KGS)", container.grossWeight],
    ["Packages", container.packageCount],
    ["Tare (KGS)", container.tare],
    ["Status", container.status ?? container.state],
    ["Last Free Day", formatDay(container.lastFreeDay)],
  ];

  // §34.4. The clocks, counted server-side, in his field grid.
  const clocks = container.freeTime ?? [];

  return (
    <div className="zht">
      <div className="content">
        <section className="view active">
          <div className="header-row">
            <div>
              <button className="btn secondary" type="button" onClick={onBack}>← Back</button>
              <h2 style={{ display: "inline-block", marginLeft: 12 }}>{job.id}</h2>
            </div>
            <span>{job.derived?.status}</span>
          </div>

          {job.type === "Import" ? <Handover job={job} onHandOver={onHandOver} /> : null}

          {/* §31, §32. The trip the box makes, and the only place on this
              screen that answers "where are we" and "what now". The lede and
              the alarm band both said a piece of this and disagreed about the
              order; there is one sequence now. */}
          {/* `job.close` has no drawer panel of its own — closure is the
              ClosurePanel at the foot of this screen — so the step opens that
              section rather than naming a panel nothing renders. */}
          <Journey steps={job.journey ?? []} onAct={(action) => {
            if (action === "job.close") { setShowClosing(true); return; }
            if (action === "job.edit") return onManage("job");
            // Which checkpoint, not just "a checkpoint". Without the key the
            // drawer opened titled "Update checkpoint", could not tell what it
            // was saving, and Save did nothing at all.
            if (action === "portnet.confirm") return onManage("checkpoint", { key: "portnetReleased" });
            if (action === "permit.confirm") return onManage("checkpoint", { key: "permitReceived" });
            if (action === "movement.create" || action === "movement.update") return onManage("trip");
            // §40.2, §39, §42, §43, §44.1. The export-only commands. Each is a
            // control that already exists on this screen; the journey is where
            // a person is looking when they decide to use it.
            if (action === "cms.record") return onRecordCms();
            if (action === "container.capture") return onRecordDetails();
            if (action === "container.notify") return setShowNotify(true);
            if (action === "transhipment.record") return onManage("checkpoint", { key: "transhipment" });
            if (action === "readiness.record" || action === "vgm.record") return onManage("container");
            return onManage("job");
          }} />

          {/* The commands the import journey has no step for. CMS and
              transhipment are job-level facts, and §42's notification belongs
              to the container rather than to the trip. Shown only when the
              thing they record has genuinely not been done. */}
          {(!job.cmsCompleted
            || (job.type === "Export" && !container.number)
            || (job.type === "Export" && job.transhipment === "PENDING")) ? (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="action-row" style={{ gap: 8, flexWrap: "wrap" }}>
                {!job.cmsCompleted ? (
                  <button className="btn success" type="button" onClick={onRecordCms}>
                    Record CMS completed
                  </button>
                ) : null}
                {job.type === "Export" && !container.number ? (
                  <button className="btn primary" type="button" onClick={onRecordDetails}>
                    Record container, seal and tare
                  </button>
                ) : null}
                {job.type === "Export" && job.transhipment === "PENDING" ? (
                  <>
                    <button className="btn primary" type="button"
                      onClick={() => onSetTranshipment("available")}>Transhipment available</button>
                    <button className="btn secondary" type="button"
                      onClick={() => onSetTranshipment("not_available")}>Not available</button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* §42. The step that lets stuffing start. */}
          {job.type === "Export" && container.number && !job.detailsSent ? (
            <div ref={(el) => {
              if (showNotify && el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); setShowNotify(false); }
            }}>
              <SendDetails container={container} customer={job.customer} onSend={onSendDetails} />
            </div>
          ) : null}

          {job.type === "Export" && job.detailsSent ? (
            <div className="muted" style={{ marginBottom: 12 }}>
              Container details sent to {job.detailsSentTo || "the customer"}
              {job.detailsSentBy ? ` by ${job.detailsSentBy}` : ""}
              {job.detailsSentAt ? ` on ${formatDay(job.detailsSentAt)}` : ""}.
            </div>
          ) : null}

          {/* What the journey cannot say, because it is not a step: money
              already running. Only ever shown when a clock is actually past
              or about to pass its last free day. */}
          <Alarms container={container} />

          {/* §17. The job is its movements. Everything else on this screen
              is the paperwork around them — this is the work itself, so it is
              open, it is the largest thing here, and the next one to arrange
              is the first thing in it. */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="header-row">
              <div className="section-title">Movements</div>
              <button className="btn primary" type="button"
                onClick={() => onManage("trip")}>
                + Plan a movement
              </button>
            </div>

            {(job.trips ?? []).length ? (
              <table className="moves">
                <thead>
                  <tr>
                    <th>Reference</th><th>Type</th><th>Route</th>
                    <th>Driver / Vehicle</th><th>Planned</th><th>Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {job.trips.map((m) => (
                    <tr key={m.id}>
                      <td>{m.movementRef ?? m.id}</td>
                      <td>{m.type}</td>
                      <td className="route">{m.origin} → {m.destination}</td>
                      <td>
                        {[m.driver, m.truck].filter(Boolean).join(" / ") || "Not assigned"}
                        {m.chassisId ? <small style={{ display: "block" }}>Chassis {m.chassisId}</small> : null}
                      </td>
                      <td>
                        {formatDay(m.plannedDate)}
                        {m.plannedTime ? <small style={{ display: "block" }}>{m.plannedTime}</small> : null}
                      </td>
                      <td>{m.status}</td>
                      <td>
                        <button className="btn secondary" type="button"
                          onClick={() => onManage("trip", { tripId: m.id })}>
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="clean-empty" style={{ marginTop: 8 }}>
                No movement arranged yet. This is what the job is waiting for.
              </div>
            )}
          </div>

          {/* Open, because which container you are looking at changes every
              panel under it. The tabs are the second question a controller
              asks after "what do I do next". */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="header-row">
              <div className="section-title">
                Container {containerIndex + 1} of {containers.length}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn secondary" type="button" onClick={() => onManage("container")}>
                  Edit Container
                </button>
                <button className="btn ghost" type="button"
                  onClick={() => onManage("container", { mode: "new" })}>
                  + Add Container
                </button>
              </div>
            </div>

            {containers.length > 1 ? (
              <div className="tabs">
                {containers.map((c, i) => (
                  <button type="button" key={c.id ?? c.ref ?? i}
                    className={`tab ${i === containerIndex ? "active" : ""}`}
                    onClick={() => onSelectContainer(i)}>
                    {c.number || c.ref || `Container ${i + 1}`}
                    <br /><small>{c.status ?? c.state}</small>
                  </button>
                ))}
              </div>
            ) : null}

            {/* Identity at a glance. The full eleven fields are one click
                away in the drawer below; five of them answer "which box is
                this" and the rest are reference. */}
            <div className="idstrip">
              {[["Container", container.number], ["Seal", container.seal],
                ["Size", container.sizeType], ["Status", container.status ?? container.state],
                ["Last free day", formatDay(container.lastFreeDay)]].map(([k, v]) => (
                  <div key={k}><span className="k">{k}</span><span className="v">{v || "—"}</span></div>
                ))}
            </div>

            {/* §34. The drawer that records the carrier's allowance and the
                daily rate. Without a way in, the clocks can never be set and
                the charge estimate can never have a rate to multiply. */}
            <button className="btn secondary" type="button" style={{ marginTop: 10 }}
              onClick={() => onManage("freeTime")}>
              {clocks.length ? "Edit free time and rate" : "Confirm free time and rate"}
            </button>

            {clocks.length ? (
              <div className="fieldgrid" style={{ marginTop: 10 }}>
                {clocks.map((clock) => (
                  <Field key={clock.label} label={clock.label} value={clock.summary} />
                ))}
                {container.charge?.chargeableDays > 0 ? (
                  <Field label="Estimated charge" value={container.charge.summary} />
                ) : null}
              </div>
            ) : null}

            <Drawer title="All container detail" count={containerFields.length}>
              <div className="fieldgrid">
                {containerFields.map(([label, value]) => <Field key={label} label={label} value={value} />)}
              </div>
            </Drawer>

            {/* §32.1. Where this container stands, as a strip rather than a
                panel of its own — it is orientation, not work. */}
            <div className="timeline" style={{ marginTop: 12 }}>
              {flow.map((step, i) => (
                <span key={step}
                  className={`step ${i < stepIndex ? "done" : i === stepIndex ? "current" : ""}`}>
                  {step}
                </span>
              ))}
            </div>
          </div>

          <Drawer title="Shipment" count={job.missingInformation?.length ?? 0}>
            <div className="fieldgrid">
              {shipment.map(([label, value]) => <Field key={label} label={label} value={value} />)}
            </div>
            {job.missingInformation?.length ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Still required: {job.missingInformation.join(", ")}
              </div>
            ) : null}
            <button className="btn secondary" type="button" style={{ marginTop: 10 }}
              onClick={() => onManage("job")}>Edit Shipment</button>
          </Drawer>

          {job.permitRequired ? (
            <Drawer title="Shipment Permits" count={job.permitReceived ? 0 : 1}>
              <div className="muted" style={{ marginBottom: 8 }}>
                {job.permitReceived
                  ? "Permit recorded for this shipment."
                  : "Permit Required is selected but no permit is recorded."}
              </div>
              {/* The panel that actually adds and allocates permits, rather
                  than a "Manage Permits" button pointing at a drawer panel
                  that does not exist — which opened empty and could only be
                  cancelled. */}
              {permitPanel}
            </Drawer>
          ) : null}

          <DateAmendments jobId={job.apiId} eta={job.eta} />

          <Drawer title="Delivery Stops" count={job.deliveryAddress ? 1 : 0}>
            {job.deliveryAddress ? (
              <div className="stop">
                <b>Stop 1</b><br />{job.deliveryAddress}
                <br /><span className="muted">{job.terminal || ""}</span>
              </div>
            ) : <span className="muted">No delivery address recorded.</span>}
          </Drawer>

          <Drawer title="Job Activity Log" count={(job.activity ?? []).length}>
            {(job.activity ?? []).length ? job.activity.map((item) => (
              /* His .job-log-entry is a 4px | 1fr grid: a colour rail, then
                 the content. Without the rail div the text landed in the 4px
                 column and wrapped one word per line under the timestamp. */
              <div className="job-log-entry" key={item.id}>
                <div className="job-log-rail" />
                <div className="job-log-content">
                  <div className="job-log-meta">
                    <div><b>{item.text}</b></div>
                    <span>{formatDay(item.at)}</span>
                  </div>
                  <div className="muted">{item.actor}</div>
                </div>
              </div>
            )) : <span className="muted">No changes recorded yet.</span>}
            <button className="btn ghost" type="button" style={{ marginTop: 8 }}
              onClick={() => onManage("activity")}>Open full activity</button>
          </Drawer>

          <Drawer title="Source document" count={job.sourceDocument ? 1 : 0}>
            <div className="muted">
              {job.sourceDocument
                ? "The document this job was read from."
                : "No source document recorded for this job."}
            </div>
            <button className="btn ghost" type="button" style={{ marginTop: 8 }}
              onClick={() => onManage("source")}>Open source document</button>
          </Drawer>

          <Drawer title="Permits, documents, free time and closure" open={showClosing}>
            {extras}
          </Drawer>
        </section>
      </div>
    </div>
  );
}
