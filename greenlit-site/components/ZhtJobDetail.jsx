"use client";

import { useState } from "react";
import { IMPORT_CONTAINER_STATUS, EXPORT_JOB_STATUS, MAX_CONTAINERS_PER_JOB } from "@greenlit/engine";

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

const Field = ({ label, value }) => (
  <div className="field"><span className="field-label">{label}</span><b>{value || "—"}</b></div>
);

export default function ZhtJobDetail({
  job, containerIndex = 0, onSelectContainer, onBack, onManage,
  onRecordCms, onSendDetails, onSetTranshipment, onRecordDetails, extras,
}) {
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

          <div className="card" style={{ marginBottom: 18 }}>
            <div className="header-row">
              <div className="section-title">Shipment</div>
              <button className="btn secondary" type="button" onClick={() => onManage("job")}>
                Edit Shipment
              </button>
            </div>
            <div className="fieldgrid">
              {shipment.map(([label, value]) => <Field key={label} label={label} value={value} />)}
            </div>
            {job.missingInformation?.length ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Still required: {job.missingInformation.join(", ")}
              </div>
            ) : null}
          </div>

          {job.permitRequired ? (
            <div className="card job-permit-card" style={{ marginBottom: 18 }}>
              <div className="header-row">
                <div>
                  <div className="section-title">Shipment Permits</div>
                  <div className="muted">
                    Permit files are stored once and references are linked to containers.
                  </div>
                </div>
                <button className="btn secondary" type="button" onClick={() => onManage("permits")}>
                  Manage Permits
                </button>
              </div>
              <div>
                {job.permitReceived
                  ? <span className="muted">Permit recorded for this shipment.</span>
                  : <span className="muted">Permit Required is selected but no permit is recorded.</span>}
              </div>
            </div>
          ) : null}

          <div className="card" style={{ marginBottom: 18 }}>
            <div className="section-title">Containers Under This Job</div>
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
            {/* §29. The cap is the engine's number, not a literal typed here,
                so the button and validateContainerCount can never disagree. */}
            <button className="btn ghost" type="button"
              disabled={containers.length >= MAX_CONTAINERS_PER_JOB}
              onClick={() => onManage("container", { mode: "new" })}>
              {containers.length >= MAX_CONTAINERS_PER_JOB
                ? `${MAX_CONTAINERS_PER_JOB} container limit`
                : "+ Add Container"}
            </button>
          </div>

          <div className="job-layout">
            <div>
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="header-row">
                  <div className="section-title">Selected Container</div>
                  <button className="btn secondary" type="button" onClick={() => onManage("container")}>
                    Edit Container
                  </button>
                </div>
                <div className="fieldgrid">
                  {containerFields.map(([label, value]) => <Field key={label} label={label} value={value} />)}
                </div>
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
              </div>

              <div className="card" style={{ marginBottom: 18 }}>
                <div className="section-title">Operational Progress</div>
                <div className="timeline">
                  {flow.map((step, i) => (
                    <span key={step}
                      className={`step ${i < stepIndex ? "done" : i === stepIndex ? "current" : ""}`}>
                      {step}
                    </span>
                  ))}
                </div>
                {/* §31. The engine's answer, not a chain of ifs in the browser. */}
                <div className="action-row" style={{ marginTop: 12 }}>
                  <div>
                    <b>{job.derived?.nextAction || "Nothing outstanding"}</b>
                    {job.derived?.blocking
                      ? <div className="muted">{job.derived.blocking}</div>
                      : null}
                    <div className="muted">Waiting on {job.derived?.waitingOn ?? "nobody"}</div>
                  </div>
                </div>

                {/* The commands that move a gate. His demo derives which button
                    to show from the container status; these are driven by the
                    stored facts the gate actually reads, so a button appears
                    when the thing it records has genuinely not been done. */}
                <div className="action-row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                  {!job.cmsCompleted ? (
                    <button className="btn success" type="button" onClick={onRecordCms}>
                      Record CMS completed
                    </button>
                  ) : null}

                  {/* §39. Without the number, seal and tare there is nothing
                      for §42 to send, so this is the step that unblocks it. */}
                  {job.type === "Export" && !container.number ? (
                    <button className="btn primary" type="button" onClick={onRecordDetails}>
                      Record container, seal and tare
                    </button>
                  ) : null}

                  {job.type === "Export" && job.transhipment === "PENDING" ? (
                    <>
                      <button className="btn primary" type="button"
                        onClick={() => onSetTranshipment("available")}>
                        Transhipment available
                      </button>
                      <button className="btn secondary" type="button"
                        onClick={() => onSetTranshipment("not_available")}>
                        Not available
                      </button>
                    </>
                  ) : null}
                </div>

                {/* §42. The step that lets stuffing start. Shown only once the
                    container has a number to send, because the notification is
                    generated from stored data and there is nothing to send
                    before that. */}
                {job.type === "Export" && container.number && !job.detailsSent ? (
                  <SendDetails container={container} customer={job.customer} onSend={onSendDetails} />
                ) : null}

                {job.type === "Export" && job.detailsSent ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Container details sent to {job.detailsSentTo || "the customer"}
                    {job.detailsSentBy ? ` by ${job.detailsSentBy}` : ""}
                    {job.detailsSentAt ? ` on ${formatDay(job.detailsSentAt)}` : ""}.
                  </div>
                ) : null}
              </div>

              <div className="card">
                <div className="section-title">Movements</div>
                <div>
                  {(job.trips ?? []).length ? job.trips.map((m) => (
                    <div className="movement" key={m.id}>
                      <strong>{m.type}</strong>{m.origin} → {m.destination}
                      <br />
                      <span className="muted">
                        {[m.driver, m.truck, m.chassisId ? `Chassis ${m.chassisId}` : null, m.status]
                          .filter(Boolean).join(" / ")}
                        {m.plannedDate ? ` / ${formatDay(m.plannedDate)}${m.plannedTime ? ` ${m.plannedTime}` : ""}` : ""}
                      </span>
                    </div>
                  )) : <span className="muted">No movements planned yet.</span>}
                </div>
              </div>
            </div>

            <div>
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="section-title">Delivery Stops</div>
                <div>
                  {job.deliveryAddress ? (
                    <div className="stop">
                      <b>Stop 1</b><br />{job.deliveryAddress}
                      <br /><span className="muted">{job.terminal || ""}</span>
                    </div>
                  ) : <span className="muted">No delivery address recorded.</span>}
                </div>
              </div>

              {extras ? <div className="card" style={{ marginBottom: 18 }}>{extras}</div> : null}

              <div className="card job-log-card">
                <div className="job-log-head">
                  <div>
                    <div className="section-title">Job Activity Log</div>
                    <div className="muted">
                      Shipment, container and operational changes are synchronized into one job record.
                    </div>
                  </div>
                </div>
                <div className="job-activity-log">
                  {(job.activity ?? []).length ? job.activity.map((item) => (
                    <div className="job-log-entry" key={item.id}>
                      <b>{item.text}</b>
                      <div className="muted">{item.at} · {item.actor}</div>
                    </div>
                  )) : <span className="muted">No changes recorded yet.</span>}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
