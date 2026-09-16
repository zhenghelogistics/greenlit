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

const DAY = 86_400_000;

const dayPart = (value) => (value ? String(value).slice(0, 10) : "");

/** DD/MM/YYYY, the way every other date in this system is written. */
function formatDay(value) {
  const iso = dayPart(value);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function dayLabel(iso, today) {
  if (!iso) return "—";
  if (iso === today) return "Today";
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(date);
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

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

function AttentionItem({ item }) {
  const kind = item.kind === "attention" ? " attention" : item.kind === "gate" ? " gate" : "";
  return (
    <div className={`attention-detail-item${kind}`} title={item.detail || item.label}>
      <span className="attention-detail-label">{item.label}</span>
      {item.detail ? <small>{item.detail}</small> : null}
    </div>
  );
}

export default function ZhtDashboard({ jobs, today, onOpenJob, onNewJob, onShowActions }) {
  const active = jobs.filter((j) => j.derived?.jobStatus !== "Completed");
  const imports = active.filter((j) => j.type === "Import");

  const needInfo = active.filter((j) => !j.infoComplete);
  const permitAttention = active.filter((j) => j.permitRequired && !j.permitReceived);
  const readyForController = active.filter((j) => j.infoComplete
    && !(j.permitRequired && !j.permitReceived));

  // His list, capped at six, each job carrying at most five visible issues.
  const attentionJobs = active
    .map((job) => ({ job, issues: attentionItems(job, today) }))
    .filter((entry) => entry.issues.length > 0);

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
  const workload = [0, 1, 2].map((offset) => {
    const iso = new Date(Date.parse(`${today}T00:00:00Z`) + offset * DAY)
      .toISOString().slice(0, 10);
    return { iso, label: dayLabel(iso, today), count: imports.filter((j) => dayPart(j.eta) === iso).length };
  });
  const peak = Math.max(1, ...workload.map((w) => w.count));

  // §34.5. Inside two days of the last free day, or past it.
  const lfdRisk = imports.filter((j) => {
    const lfd = dayPart(j.demurrageLastFreeDay);
    return lfd && daysBetween(today, lfd) <= 2;
  });
  const etaPassed = imports.filter((j) => dayPart(j.eta) && dayPart(j.eta) < today);
  const portnetPending = imports.filter((j) => !j.portnetReleased);

  return (
    <div className="zht">
      <div className="content">
        <section className="view active">
          <div className="dashboard-role-head clean-dashboard-head">
            <div>
              <h2 style={{ margin: 0 }}>Control Tower</h2>
              <div className="muted">Operational overview</div>
            </div>
            <div className="dashboard-head-actions">
              <button type="button" className="btn primary" onClick={onNewJob}>+ New Job</button>
            </div>
          </div>

          <div className="control-tower-summary">
            <div>
              <div className="control-tower-kicker">DAILY OPERATIONS CONTROL TOWER</div>
              <div className="control-tower-date">{formatDay(today)} · Daily operational view</div>
            </div>
            <div className="control-tower-summary-note">
              Focus: Job preparation → Missing information → Validation → Controller handover
            </div>
          </div>

          <div className="clean-metrics control-tower-metrics">
            <button type="button" className="clean-metric" onClick={() => onShowActions("active")}>
              <span>Active Jobs</span><strong>{active.length}</strong>
              <small>Jobs being prepared / monitored</small>
            </button>
            <button type="button" className="clean-metric attention-soft" onClick={() => onShowActions("blocked")}>
              <span>Requires Information</span><strong>{needInfo.length}</strong>
              <small>Jobs not handover-ready</small>
            </button>
            <button type="button" className="clean-metric attention-soft" onClick={() => onShowActions("blocked")}>
              <span>Permit Attention</span><strong>{permitAttention.length}</strong>
              <small>Missing, untagged or invalid permits</small>
            </button>
            <button type="button" className="clean-metric" onClick={() => onShowActions("active")}>
              <span>Ready for Controller</span><strong>{readyForController.length}</strong>
              <small>Required handover information complete</small>
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

          <div className="control-tower-grid">
            <div className="card control-tower-attention-card">
              <div className="clean-section-head">
                <div>
                  <div className="section-title">Requires Information / Attention</div>
                  <div className="muted">
                    Required job information, validation issues and handover items to resolve.
                  </div>
                </div>
                <button className="btn secondary" type="button" onClick={() => onShowActions("blocked")}>
                  View jobs
                </button>
              </div>
              <div className="ops-attention-list">
                {attentionJobs.length ? attentionJobs.slice(0, 6).map(({ job, issues }) => {
                  const visible = issues.slice(0, 5);
                  const extra = issues.length - visible.length;
                  return (
                    <div className="ops-attention-job" key={job.id}>
                      <div className="ops-attention-job-head">
                        <div>
                          <button type="button" className="job-link" onClick={() => onOpenJob(job)}>{job.id}</button>
                          <small>{job.customer || "Customer TBA"}</small>
                        </div>
                        <span className="attention-count">
                          {issues.length} item{issues.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="ops-attention-issues">
                        {visible.map((item) => <AttentionItem key={item.label} item={item} />)}
                        {extra > 0 ? (
                          <button className="attention-more" type="button" onClick={() => onOpenJob(job)}>
                            +{extra} more — open job
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="clean-empty">No active jobs currently require attention.</div>
                )}
              </div>
            </div>

            <div className="card control-tower-arrivals-card">
              <div className="clean-section-head">
                <div>
                  <div className="section-title">Vessel Arrivals</div>
                  <div className="muted">Today and future arrivals only. Passed ETAs move to Attention.</div>
                </div>
              </div>
              <div id="opsVesselTimeline">
                {arrivals.length ? arrivals.slice(0, 6).map((group) => (
                  <button className="vessel-timeline-item" type="button" key={group.key}
                    onClick={() => onShowActions("active")}>
                    <b>{dayLabel(group.date, today).toUpperCase()}</b>
                    <span>{group.vessel}</span>
                    <small>{group.jobs.length} job{group.jobs.length === 1 ? "" : "s"} · {group.containers} container{group.containers === 1 ? "" : "s"}</small>
                  </button>
                )) : (
                  <div className="clean-empty">No upcoming vessel arrivals recorded.</div>
                )}
              </div>
            </div>
          </div>

          <div className="control-tower-grid control-tower-bottom">
            <div className="card">
              <div className="clean-section-head">
                <div>
                  <div className="section-title">Next 3 Days — Incoming Workload</div>
                  <div className="muted">
                    Import workload by Vessel ETA, showing upcoming documentation / preparation demand.
                  </div>
                </div>
              </div>
              <div className="workload-chart">
                {workload.map((day) => (
                  <div className="workload-row" key={day.iso}>
                    <div className="workload-day">{day.label}</div>
                    <div className="workload-track">
                      <div className="workload-fill" style={{ width: `${(day.count / peak) * 100}%` }} />
                    </div>
                    <b>{day.count}</b>
                  </div>
                ))}
              </div>
            </div>

            <div className="card clean-alert-card">
              <div className="section-title">Operational Alerts</div>
              <div className="muted control-tower-alert-note">
                Vessel ETA, LFD and permit alerts requiring awareness.
              </div>
              {etaPassed.length ? (
                <div className="clean-alert-item danger">
                  <b>🔴 Vessel ETA passed</b>
                  <div>{etaPassed.length} job{etaPassed.length === 1 ? "" : "s"} · Confirm / update ETA · {etaPassed.slice(0, 3).map((j) => j.id).join(", ")}</div>
                </div>
              ) : null}
              {portnetPending.length ? (
                <div className="clean-alert-item">
                  <b>🟡 Portnet not released</b>
                  <div>{portnetPending.length} import container{portnetPending.length === 1 ? "" : "s"} pending</div>
                </div>
              ) : null}
              {lfdRisk.length ? (
                <div className="clean-alert-item danger">
                  <b>🔴 Last Free Day approaching</b>
                  <div>
                    {lfdRisk.slice(0, 4).map((j) => (
                      <div key={j.id}>{j.id} · {j.container || "container"} ({formatDay(j.demurrageLastFreeDay)})</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {!etaPassed.length && !portnetPending.length && !lfdRisk.length ? (
                <div className="clean-empty">No operational alerts.</div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
