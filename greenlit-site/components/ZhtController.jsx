"use client";

import { useState } from "react";

/**
 * The controller's workspace.
 *
 * §7 already has roles, and they are about permission: MANAGEMENT may reopen a
 * billed job and OPERATIONS may not. This is a different axis entirely — what
 * work a person is doing right now — so it is a view anyone can switch to and
 * never a permission. Conflating the two would mean a controller covering for
 * a colleague needs their account changed to do an afternoon's planning.
 *
 * The assistant works a job until its information is complete. The controller
 * works the fleet: which boxes are ready to move, where each truck finishes,
 * and what it could pick up there. Same records, different question.
 */

const today = () => new Date().toISOString().slice(0, 10);
const day = (v) => {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/**
 * The four queues, read off statuses the engine already derived.
 *
 * Deliberately not re-derived here: a screen that works out for itself whether
 * a container is ready is a screen that can disagree with the one next to it.
 */
export function controllerQueues(jobs) {
  const containersOf = (job) => (job.containers ?? []).map((c) => ({ job, c }));
  const all = jobs.flatMap(containersOf);
  const iso = today();

  return {
    importReady: all.filter(({ job, c }) =>
      job.type === "Import" && (c.status ?? c.state) === "Ready for Collection"),
    exportReady: all.filter(({ job, c }) =>
      job.type === "Export" && (c.status ?? c.state) === "Ready for Empty Collection"),
    emptyReturns: all.filter(({ c }) =>
      ["Empty Return Pending", "Empty Returned"].includes(c.status ?? c.state)),
    planned: jobs.flatMap((job) =>
      (job.trips ?? [])
        .filter((t) => String(t.plannedDate ?? "").slice(0, 10) === iso)
        .map((t) => ({ job, trip: t }))),
  };
}

function QueueTable({ rows, onOpenJob, empty }) {
  if (!rows.length) return <div className="clean-empty">{empty}</div>;
  return (
    <table className="moves">
      <thead>
        <tr><th>Job / Container</th><th>Customer</th><th>Vessel / ETA</th><th>Status</th><th /></tr>
      </thead>
      <tbody>
        {rows.map(({ job, c }) => (
          <tr key={`${job.id}-${c.id ?? c.ref}`}>
            <td className="route">
              {job.id}<span className="sub">{c.number || c.ref}</span>
            </td>
            <td>{job.customer || "Customer TBA"}</td>
            <td>{job.vessel || "—"}<span className="sub">{day(job.eta)}</span></td>
            <td>{c.status ?? c.state}</td>
            <td>
              <button className="btn secondary" type="button" onClick={() => onOpenJob(job)}>
                Plan
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ZhtController({ jobs, fleet, onOpenJob }) {
  const q = controllerQueues(jobs);
  const [tab, setTab] = useState("importReady");

  const tabs = [
    ["importReady", "Import ready", q.importReady.length],
    ["exportReady", "Export ready", q.exportReady.length],
    ["emptyReturns", "Empty returns", q.emptyReturns.length],
    ["planned", "Planned today", q.planned.length],
  ];

  const engaged = fleet?.vehicles ?? [];
  const opportunities = fleet?.routeOpportunities ?? [];
  const chainsFor = (truck) => opportunities.filter((o) => o.finishing.truck === truck);

  // Every rule in the ported stylesheet is scoped to `.zht`. Without this
  // wrapper the screen renders as unstyled markup — which is exactly what it
  // did: a wall of text with the sidebar overlapping it.
  return (
    <div className="zht">
      <div className="content">
      <div className="clean-metrics control-tower-metrics">
        {tabs.map(([id, label, n]) => (
          <div className={`clean-metric${n > 0 && id !== "planned" ? " attention-soft" : ""}`} key={id}>
            <span>{label}</span><strong>{n}</strong>
            <small>
              {id === "importReady" ? "Portnet released, ready to plan"
                : id === "exportReady" ? "CMS done, ready for collection"
                  : id === "emptyReturns" ? "Boxes to get back to the depot"
                    : "Movements on today's plan"}
            </small>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="section-title">Controller job board</div>
        <div className="muted">
          Jobs stay visible by movement, so trips can be chained and empty running reduced.
        </div>

        <div className="queue-tabs" role="tablist">
          {tabs.map(([id, label, n]) => (
            <button key={id} type="button" role="tab" className="queue-tab"
              aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}<span className="n">{n}</span>
            </button>
          ))}
        </div>

        {tab === "planned" ? (
          q.planned.length ? (
            <table className="moves">
              <thead>
                <tr><th>Movement</th><th>Job</th><th>Route</th><th>Driver / Vehicle</th><th>Status</th></tr>
              </thead>
              <tbody>
                {q.planned.map(({ job, trip }) => (
                  <tr key={`${job.id}-${trip.id}`}>
                    <td className="route">{trip.movementRef ?? trip.id}<span className="sub">{trip.type}</span></td>
                    <td>{job.id}</td>
                    <td>{trip.origin} → {trip.destination}</td>
                    <td>{[trip.driver, trip.truck].filter(Boolean).join(" / ") || "Not assigned"}</td>
                    <td>{trip.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="clean-empty">Nothing is planned for today yet.</div>
        ) : (
          <QueueTable rows={q[tab]} onOpenJob={onOpenJob}
            empty={
              tab === "importReady" ? "No import container is cleared to plan."
                : tab === "exportReady" ? "No export booking is ready for empty collection."
                  : "No container is waiting to go back empty."
            } />
        )}
      </div>

      <div className="card">
        <div className="section-title">Today&rsquo;s fleet plan</div>
        <div className="muted">
          Where each engaged vehicle finishes, and what is waiting there.
        </div>

        {engaged.length ? engaged.map((e) => {
          const chains = chainsFor(e.truck);
          return (
            <div className="crew" key={`${e.truck}-${e.movementRef}`}>
              <div className="crew-who">{e.driver || "Unassigned"}<small>{e.truck}</small></div>
              <div className="crew-now">
                {e.reason === "ON_STANDBY" ? "Held on standby" : "In transit"} · {e.movementRef}
                <small>{e.openEnded ? "No release recorded" : "Finishes this trip"}</small>
              </div>
              <div className="crew-now">
                {chains[0] ? <>Finishes at<small>{chains[0].at}</small></> : <span className="muted">—</span>}
              </div>
              <div>
                {chains.length ? (
                  <button className="btn secondary" type="button"
                    onClick={() => onOpenJob({ id: chains[0].waiting.jobNumber })}>
                    {chains.length} possible next job{chains.length === 1 ? "" : "s"}
                  </button>
                ) : <span className="muted" style={{ fontSize: 12 }}>Nothing waiting there</span>}
              </div>
            </div>
          );
        }) : (
          <div className="crew-idle">
            No vehicle is currently engaged. Movements appear here once a trip is
            collected or a driver is held on standby.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
