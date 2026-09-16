"use client";

import { useState } from "react";
import { IMPORT_CONTAINER_STATUS, EXPORT_JOB_STATUS } from "@greenlit/engine";

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

const Field = ({ label, value }) => (
  <div className="field"><span className="field-label">{label}</span><b>{value || "—"}</b></div>
);

export default function ZhtJobDetail({
  job, containerIndex = 0, onSelectContainer, onBack, onManage,
  onRecordCms, onSendDetails, onSetTranshipment, onRecordDetails, extras, permitPanel,
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

          {/* §31. The one thing that is never closed: what to do next, why,
              and who it is waiting on. His demo derives this from a chain of
              ifs in the browser; this is the rules engine's answer. */}
          <div className={`lede${job.derived?.blocking ? " lede--blocked" : ""}`}>
            <div className="lede-action">{job.derived?.nextAction || "Nothing outstanding"}</div>
            {job.derived?.blocking ? <div className="lede-why">{job.derived.blocking}</div> : null}
            <div className="lede-why">
              Waiting on {job.derived?.waitingOn ?? "nobody"} · {job.derived?.status ?? "—"}
            </div>
            <div className="action-row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
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
              <button className="btn secondary" type="button"
                onClick={() => onManage("checkpoint")}>Update a checkpoint</button>

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

          {job.type === "Export" && container.number && !job.detailsSent ? (
            <SendDetails container={container} customer={job.customer} onSend={onSendDetails} />
          ) : null}

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

            <div className="fieldgrid">
              {containerFields.map(([label, value]) => <Field key={label} label={label} value={value} />)}
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

          <Drawer title="Movements" count={(job.trips ?? []).length}>
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
          </Drawer>

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

          <Drawer title="Permits, documents, free time and closure">
            {extras}
          </Drawer>
        </section>
      </div>
    </div>
  );
}
