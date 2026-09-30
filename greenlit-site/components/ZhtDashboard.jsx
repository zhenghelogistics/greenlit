"use client";

import { useState } from "react";

/**
 * The Control Tower dashboard, in the PM's markup.
 *
 * His demo is the design the operation has actually been using, so the layout,
 * class names and visual language here are his, copied rather than
 * reinterpreted. `app/zht.css` is his stylesheet, ported verbatim.
 *
 * What is ours is every number on the screen. His demo recomputed missing
 * fields, statuses and deadlines in the browser from mock data; this reads the
 * values the engine already derived server-side. That split is the whole point
 * — a countdown a screen works out for itself is one that can disagree with
 * the next screen's, which is why §54 makes derived values read-only.
 *
 * So: his front end, our facts behind it.
 */

const dayPart = (value) => (value ? String(value).slice(0, 10) : "");

/** DD/MM/YYYY, the way every other date in this system is written. */
function formatDay(value) {
  const iso = dayPart(value);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * §26.1. What this job still needs, as his attention list wants it.
 *
 * The missing fields are the engine's answer, not a second opinion computed
 * here: `missingInformation` is already `missingMandatoryFields` run against
 * the mandatory set. Only the things his list shows that are not "a field is
 * blank" are added — a passed ETA and a missing permit are both cases where
 * every field is filled in and the job is still not fit to hand over.
 */
export function attentionItems(job, today) {
  const items = (job.missingInformation ?? []).map((label) => ({
    label,
    detail: `${label} is required.`,
    kind: "missing",
  }));

  const eta = dayPart(job.eta);
  if (eta && eta < today) {
    items.unshift({
      label: "Vessel ETA Passed",
      detail: `Vessel ETA ${formatDay(eta)} has already passed. Confirm / update ETA if required.`,
      kind: "attention",
    });
  }

  if (job.permitRequired && !job.permitReceived) {
    items.push({
      label: "Permit Missing",
      detail: "Permit Required is selected but no shipment-level permit is recorded.",
      kind: "attention",
    });
  }

  if (job.type === "Import" && !job.portnetReleased) {
    items.push({
      label: "Portnet",
      detail: "Portnet release is not recorded for this container.",
      kind: "gate",
    });
  }

  return items;
}

/**
 * Where a job stands before the controller, as the demo's Job Preparation &
 * Handover panel says it: REQUIRES INFORMATION while a handover check fails,
 * READY FOR HANDOVER once a box can go, HANDED OVER x/y as boxes go.
 */
export function preparation(job) {
  if (job.type === "Import") {
    const boxes = job.containers ?? [];
    const handed = boxes.filter((c) => c.handedOver).length;
    const waiting = boxes.filter((c) => !c.handedOver);
    const needs = (job.handoverShipmentGaps ?? []).length > 0
      || waiting.some((c) => (c.handoverGaps ?? []).length > 0);
    const state = handed === boxes.length && boxes.length ? "HANDED OVER"
      : needs && !waiting.some((c) => c.readyForHandover) ? "REQUIRES INFORMATION"
        : waiting.some((c) => c.readyForHandover) ? "READY FOR HANDOVER"
          : handed ? "HANDED OVER" : "REQUIRES INFORMATION";
    return { state, handed, total: boxes.length, needs };
  }
  const handed = Boolean(job.handedOverAt);
  const needs = (job.exportHandoverGaps ?? []).length > 0;
  return {
    state: handed ? "HANDED OVER" : needs ? "REQUIRES INFORMATION" : "READY FOR HANDOVER",
    handed: handed ? 1 : 0, total: 1, needs,
  };
}

const TABS = [
  ["all", "All"], ["import", "Import"], ["export", "Export"],
  ["needs", "Requires Information"], ["ready", "Ready for Controller"],
];

export default function ZhtDashboard({ jobs, today, onOpenJob, onNewJob, onViewJobs }) {
  const [tab, setTab] = useState("all");
  const active = jobs.filter((j) => j.derived?.status !== "Completed");
  const prep = new Map(active.map((j) => [j.id, preparation(j)]));
  const inTab = {
    all: active,
    import: active.filter((j) => j.type === "Import"),
    export: active.filter((j) => j.type === "Export"),
    needs: active.filter((j) => prep.get(j.id).state === "REQUIRES INFORMATION"),
    ready: active.filter((j) => prep.get(j.id).state === "READY FOR HANDOVER"),
  };
  const rows = inTab[tab] ?? active;

  // The cards and the tabs are one control: pressing a card shows its jobs
  // here, as the demo does, instead of going to another screen.
  const card = (id, label, hint, tone) => (
    <button type="button" className={`clean-metric${tone ? ` ${tone}` : ""}`} aria-pressed={tab === id}
      onClick={() => setTab(id)}>
      <span>{label}</span><strong>{inTab[id].length}</strong>
      <small>{hint}</small>
    </button>
  );

  return (
    <div className="zht">
      <div className="content">
        <section className="view active">
          <div className="dashboard-role-head clean-dashboard-head">
            <div>
              <h2 style={{ margin: 0 }}>Control Tower</h2>
              <div className="muted">{formatDay(today)}</div>
            </div>
            <div className="dashboard-head-actions">
              <button type="button" className="btn primary" onClick={onNewJob}>+ New Job</button>
            </div>
          </div>

          <div className="clean-metrics control-tower-metrics">
            {card("all", "Active Jobs", "Jobs being prepared / monitored")}
            {card("import", "Import Jobs", "Arriving: terminal to customer, then the empty back")}
            {card("export", "Export Jobs", "Leaving: empties out, stuffed, back to the port")}
            {card("needs", "Requires Information", "Still missing what handover needs", "attention-soft")}
            {card("ready", "Ready for Controller", "Can be handed over now")}
          </div>

          <div className="card clean-main-card control-tower-main">
            <div className="clean-section-head">
              <div>
                <div className="section-title">Job Preparation &amp; Handover</div>
                <div className="muted">
                  Active jobs showing whether required information is complete for Controller handover.
                </div>
              </div>
              <button className="btn secondary" type="button" onClick={onViewJobs}>
                View all jobs
              </button>
            </div>
            <div className="queue-tabs" role="tablist">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" role="tab" className="queue-tab"
                  aria-selected={tab === id} onClick={() => setTab(id)}>
                  {label}<span className="n">{inTab[id].length}</span>
                </button>
              ))}
            </div>
            <div className="table-scroll">
              <table className="clean-table today-operations-table">
                <thead>
                  <tr>
                    <th>Type / Job</th><th>Customer</th><th>Vessel / Reference</th>
                    <th>Operational requirement</th><th>Preparation</th><th>Handover</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((job) => {
                    const p = prep.get(job.id);
                    return (
                      <tr key={job.id} className="row-opens" onClick={() => onOpenJob(job)}>
                        <td>
                          <span className="tag">{job.type === "Import" ? "IMPORT" : "EXPORT"}</span>{" "}
                          <button type="button" className="job-link"
                            onClick={(event) => { event.stopPropagation(); onOpenJob(job); }}>
                            {job.id}
                          </button>
                        </td>
                        <td>{job.customer || "Customer TBA"}</td>
                        <td>
                          {job.vessel || "—"}
                          <small style={{ display: "block" }}>
                            {job.type === "Import" ? `ETA ${formatDay(job.eta)}` : `BOOKING: ${job.booking || "—"}`}
                          </small>
                        </td>
                        <td>{job.type === "Import"
                          ? ((job.containers ?? []).length && (job.containers ?? []).every((c) => c.portnetReleasedAt)
                            ? "PORTNET RELEASED" : "PORTNET PENDING")
                          : (job.cmsCompleted ? "CMS DONE" : "CMS PENDING")}</td>
                        <td><span className="tag">{p.state}</span></td>
                        <td>{p.handed}/{p.total}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={6}><div className="clean-empty">No jobs here.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Requires Information / Attention, Vessel Arrivals, Next 3 Days
              and Operational Alerts were all here, and all four were
              answering the same question. Operations put it plainly: "too
              many same prompters — everything is showing required
              information".

              They were right. Job Preparation & Handover above already
              lists every job and says what each one is waiting for, so the
              panels below repeated its rows under four headings and the
              screen read as four times as much work as there was.

              Arrivals by vessel live on the controller's board, which is
              where somebody planning trucks looks; the alerts are the same
              rows filtered, and Action Required is that list already. */}
        </section>
      </div>
    </div>
  );
}
