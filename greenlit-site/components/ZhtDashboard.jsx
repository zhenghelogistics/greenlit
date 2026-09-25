"use client";

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

export default function ZhtDashboard({ jobs, today, onOpenJob, onNewJob, onShowActions }) {
  const active = jobs.filter((j) => j.derived?.jobStatus !== "Completed");
  const imports = active.filter((j) => j.type === "Import");

  const exports = active.filter((j) => j.type === "Export");

  /**
   * Jobs still waiting on something before a controller can take them.
   *
   * A missing permit is one of those things rather than a category of its own.
   * Permit Attention was its own card and its jobs were counted in Requires
   * Information as well, so one job appeared under two headings and the board
   * read as more work than there was. Operations asked for it plainly: "so I
   * do not need that permit attention tab".
   */
  const needInfo = active.filter((j) =>
    !j.infoComplete || (j.permitRequired && !j.permitReceived));

  // His list, capped at six, each job carrying at most five visible issues.
  // Today and future only; a passed ETA belongs in Attention, not here.
  const arrivals = [];
  for (const job of imports) {
    const eta = dayPart(job.eta);
    if (!eta || eta < today) continue;
    const key = `${eta}|${job.vessel || "Unknown Vessel"}`;
    let group = arrivals.find((g) => g.key === key);
    if (!group) {
      group = { key, date: eta, vessel: job.vessel || "Unknown Vessel", jobs: [], containers: 0 };
      arrivals.push(group);
    }
    group.jobs.push(job.id);
    group.containers += (job.containers ?? []).length;
  }
  arrivals.sort((a, b) => a.date.localeCompare(b.date));

  // Next three days of incoming work, counted by vessel ETA.
  // §34.5. Inside two days of the last free day, or past it.
  return (
    <div className="zht">
      <div className="content">
        <section className="view active">
          {/* One heading.
              
              There were three stacked, and they all said the same thing:
              "Control Tower / Operational overview", then a capitalised
              "DAILY OPERATIONS CONTROL TOWER / Daily operational view", then
              "Focus: Job preparation → Missing information → Validation →
              Controller handover".

              None of that tells somebody opening this at seven in the morning
              anything they do not know. The process line in particular is a
              description of the app, read once and never again, taking the
              room that should have been white.

              What is left is what changes: which day it is, and the way in. */}
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
            <button type="button" className="clean-metric" onClick={() => onShowActions("active")}>
              <span>Active Jobs</span><strong>{active.length}</strong>
              <small>Jobs being prepared / monitored</small>
            </button>
            <button type="button" className="clean-metric" onClick={() => onShowActions("import")}>
              <span>Import Jobs</span><strong>{imports.length}</strong>
              <small>Arriving: terminal to customer, then the empty back</small>
            </button>
            <button type="button" className="clean-metric" onClick={() => onShowActions("export")}>
              <span>Export Jobs</span><strong>{exports.length}</strong>
              <small>Leaving: empties out, stuffed, back to the port</small>
            </button>
            <button type="button" className="clean-metric attention-soft" onClick={() => onShowActions("blocked")}>
              <span>Required Information</span><strong>{needInfo.length}</strong>
              <small>Import and export jobs still missing something, permits included</small>
            </button>
          </div>

          <div className="card clean-main-card control-tower-main">
            <div className="clean-section-head">
              <div>
                <div className="section-title">Job Preparation &amp; Handover</div>
                <div className="muted">
                  Active jobs showing whether required information is complete for Controller handover.
                </div>
              </div>
              <button className="btn secondary" type="button" onClick={() => onShowActions("active")}>
                View all jobs
              </button>
            </div>
            <div className="table-scroll">
              <table className="clean-table today-operations-table">
                <thead>
                  <tr>
                    <th>Job / Container</th><th>Customer</th><th>Vessel / ETA</th>
                    <th>Delivery</th><th>Portnet</th><th>LFD</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {active.length ? active.slice(0, 12).map((job) => (
                    <tr key={job.id}>
                      <td>
                        <button type="button" className="job-link" onClick={() => onOpenJob(job)}>{job.id}</button>
                        {job.container ? <small style={{ display: "block" }}>{job.container}</small> : null}
                      </td>
                      <td>{job.customer || "Customer TBA"}</td>
                      <td>{job.vessel || "—"}<small style={{ display: "block" }}>{formatDay(job.eta)}</small></td>
                      <td>{job.deliveryAddress || "TBA"}</td>
                      <td>{job.type === "Import" ? (job.portnetReleased ? "Released" : "Pending") : "—"}</td>
                      <td>{formatDay(job.demurrageLastFreeDay)}</td>
                      <td>{job.derived?.jobStatus ?? "—"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7}><div className="clean-empty">No active jobs.</div></td></tr>
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
