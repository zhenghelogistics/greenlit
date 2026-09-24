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
    // The four import piles, read off the stage the engine derived rather than
    // matched against a status string. A screen that matches strings is a
    // screen that silently empties when a status is reworded.
    importPending: all.filter(({ job, c }) =>
      job.type === "Import" && c.controllerStage === "PENDING"),
    importReady: all.filter(({ job, c }) =>
      job.type === "Import" && c.controllerStage === "READY"),
    importDelivered: all.filter(({ job, c }) =>
      job.type === "Import" && c.controllerStage === "DELIVERED"),
    exportReady: all.filter(({ job, c }) =>
      job.type === "Export" && (c.status ?? c.state) === "Ready for Empty Collection"),
    emptyReturns: all.filter(({ c }) => c.controllerStage === "EMPTY"),
    planned: jobs.flatMap((job) =>
      (job.trips ?? [])
        .filter((t) => String(t.plannedDate ?? "").slice(0, 10) === iso)
        .map((t) => ({ job, trip: t }))),
  };
}


/**
 * Pending collection, grouped by job.
 *
 * Grouped because the two things holding a container — the Portnet release and
 * the discharge — are answered per shipment and per box respectively, and a
 * flat list makes the controller confirm the same bill of lading thirty times.
 *
 * The bulk action stops at the job. An "apply to everything pending" was built
 * and then removed: a controller confirming one vessel's discharge would
 * silently mark another vessel's containers too.
 */

/**
 * The days a controller actually asks about.
 *
 * "Next 3 days" means the three days *after* today, not today and two more.
 * That distinction is worth being exact about: a controller pressing it on
 * Thursday morning is planning Friday, Saturday and Sunday — they already know
 * about Thursday, because they are standing in it.
 */
const RANGES = [
  ["today", "Today", 0, 0],
  ["tomorrow", "Tomorrow", 1, 1],
  ["three", "Next 3 days", 1, 3],
  ["seven", "Next 7 days", 1, 7],
];

const isoPlus = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return at.toISOString().slice(0, 10);
};

/**
 * What is arriving, grouped by vessel and day.
 *
 * A controller's morning question is not "which containers" but "what is
 * landing, and is any of it ready" — one ship at a time, because one ship is
 * one conversation with the terminal.
 */
function ArrivalBrief({ rows, range, today, onOpenJob }) {
  const [, , from, to] = RANGES.find((r) => r[0] === range) ?? RANGES[0];
  const first = isoPlus(today, from);
  const last = isoPlus(today, to);

  const groups = new Map();
  for (const { job, c } of rows) {
    const eta = (job.eta ?? "").slice(0, 10);
    if (!eta || eta < first || eta > last) continue;
    const key = `${eta}|${job.vessel || "Vessel to be advised"}`;
    const group = groups.get(key);
    if (group) group.rows.push({ job, c });
    else groups.set(key, { eta, vessel: job.vessel || "Vessel to be advised", rows: [{ job, c }] });
  }

  const arrivals = [...groups.values()].sort((a, b) => a.eta.localeCompare(b.eta));
  // Nothing in the window is not worth a paragraph: the date buttons above it
  // already say which window is open, and an empty strip between them and the
  // piles below just separates two things that belong together.
  if (arrivals.length === 0) return null;

  return (
    <div className="controller-arrival-brief">
      {arrivals.map((a) => {
        const ready = a.rows.filter(({ c }) => c.controllerStage === "READY").length;
        const waiting = a.rows.length - ready;
        return (
          <button
            key={`${a.eta}-${a.vessel}`} type="button"
            className={`arrival-card${a.eta === today ? " today" : ""}`}
            onClick={() => onOpenJob(a.rows[0].job)}
          >
            <div className="arrival-date">{a.eta === today ? "Today" : day(a.eta)}</div>
            <div className="arrival-vessel">{a.vessel}</div>
            <div className="arrival-stats">
              {a.rows.length} container{a.rows.length === 1 ? "" : "s"}<br />
              {ready} ready · {waiting} waiting
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PendingByJob({ rows, onOpenJob, onDischargeMany, onPortnet }) {
  const [picked, setPicked] = useState(() => new Set());

  if (!rows.length) return <div className="clean-empty">Nothing waiting on Portnet or discharge.</div>;

  const byJob = new Map();
  for (const row of rows) {
    const list = byJob.get(row.job.id);
    if (list) list.push(row); else byJob.set(row.job.id, [row]);
  }

  const toggle = (id) => setPicked((was) => {
    const next = new Set(was);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      {[...byJob.values()].map((group) => {
        const job = group[0].job;
        const undischarged = group.filter(({ c }) => !c.dischargedAt);
        const chosen = undischarged.filter(({ c }) => picked.has(c.id)).map(({ c }) => c.id);

        return (
          <section className="card" key={job.id} style={{ marginBottom: 14 }}>
            <div className="clean-section-head">
              <div>
                <div className="section-title">
                  {job.id} · {job.vessel || "Vessel TBA"} · {group.length} container{group.length === 1 ? "" : "s"}
                </div>
                <div className="muted">{job.customer || "Customer TBA"} · ETA {day(job.eta)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!job.portnetReleased ? (
                  <button className="btn secondary" type="button" onClick={() => onPortnet(job)}>
                    Portnet released
                  </button>
                ) : null}
                {undischarged.length > 0 ? (
                  <>
                    <button
                      className="btn secondary" type="button"
                      disabled={chosen.length === 0}
                      onClick={() => { onDischargeMany(job, chosen); setPicked(new Set()); }}
                    >
                      Discharge {chosen.length || ""} selected
                    </button>
                    <button
                      className="btn primary" type="button"
                      onClick={() => onDischargeMany(job, undischarged.map(({ c }) => c.id))}
                    >
                      Discharge all {undischarged.length}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <table className="moves">
              <thead>
                <tr><th /><th>Container</th><th>Portnet</th><th>Discharged</th><th>Waiting on</th></tr>
              </thead>
              <tbody>
                {group.map(({ c }) => (
                  <tr key={c.id ?? c.ref}>
                    <td>
                      {c.dischargedAt ? null : (
                        <input
                          type="checkbox" checked={picked.has(c.id)}
                          onChange={() => toggle(c.id)}
                          aria-label={`Select ${c.number || c.ref}`}
                          style={{ width: 16, height: 16 }}
                        />
                      )}
                    </td>
                    <td className="route">
                      <button className="btn ghost" type="button" onClick={() => onOpenJob(job)}>
                        {c.number || c.ref}
                      </button>
                      <span className="sub">{c.sizeType}</span>
                    </td>
                    <td>{job.portnetReleased ? "Released" : "Pending"}</td>
                    <td>{c.dischargedAt ? day(c.dischargedAt) : "Pending"}</td>
                    <td>{(c.pendingReasons ?? []).join(" and ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}

function QueueTable({ rows, onOpenJob, empty, onDeliver }) {
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
            <td style={{ display: "flex", gap: 6 }}>
              <button className="btn secondary" type="button" onClick={() => onOpenJob(job)}>
                Plan
              </button>
              {/* Only where the trip has happened: a container is marked
                  delivered once, by the person who knows it arrived. */}
              {onDeliver && c.canPlanCollection ? (
                <button className="btn ghost" type="button" onClick={() => onDeliver(job, c)}>
                  Delivered
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ZhtController({ jobs, fleet, onOpenJob, onDischargeMany, onPortnet, onDeliver }) {
  const q = controllerQueues(jobs);
  const [tab, setTab] = useState("importPending");
  const [range, setRange] = useState("today");

  // The import piles in the order a container moves through them, so the board
  // reads left to right the way the work does.
  const tabs = [
    ["importPending", "Pending collection", q.importPending.length],
    ["importReady", "Ready for collection", q.importReady.length],
    ["importDelivered", "Delivered", q.importDelivered.length],
    ["emptyReturns", "Empty returns", q.emptyReturns.length],
    ["exportReady", "Export ready", q.exportReady.length],
    ["planned", "Planned today", q.planned.length],
  ];

  // Said once at the top of the pile, because four numbers and no explanation
  // makes a controller open rows to find out what the numbers mean.
  const MEANING = {
    importPending: "Waiting on Portnet release or discharge. Nothing can be collected yet.",
    importReady: "Released and discharged. A truck can be sent.",
    importDelivered: "At the customer. Waiting for them to finish with the box.",
    emptyReturns: "Finished with. Ready to plan the empty back to the depot.",
    exportReady: "CMS done. The empty can be collected.",
    planned: "Every movement planned for today.",
  };

  const engaged = fleet?.vehicles ?? [];
  const opportunities = fleet?.routeOpportunities ?? [];
  const chainsFor = (truck) => opportunities.filter((o) => o.finishing.truck === truck);

  // Every rule in the ported stylesheet is scoped to `.zht`. Without this
  // wrapper the screen renders as unstyled markup — which is exactly what it
  // did: a wall of text with the sidebar overlapping it.
  return (
    <div className="zht">
      <div className="content">
      {/* The six counts used to be here as cards and again below as tabs, one
          set of which could be clicked. Two readings of the same six numbers
          is two things to keep in step and one of them always wrong.

          What stays at the top is the only number that is not a pile: how much
          of today is unplanned, which is the question the board exists to
          answer and which no tab shows. */}
      <div className="clean-metrics" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div className={`clean-metric${q.importPending.length > 0 ? " attention-soft" : ""}`}>
          <span>Waiting on Portnet or discharge</span>
          <strong>{q.importPending.length}</strong>
          <small>Nothing can be collected until both are done</small>
        </div>
        <div className="clean-metric">
          <span>Ready, and not yet planned</span>
          <strong>{q.importReady.filter(({ job, c }) => !(job.trips ?? []).some((t) => t.containerId === c.id)).length}</strong>
          <small>A truck can go today</small>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="section-title">Controller job board</div>
        <div className="muted">
          Jobs stay visible by movement, so trips can be chained and empty running reduced.
        </div>

        {/* What is landing, before which pile it is in: the morning question
            is about ships, and only then about boxes. */}
        <div className="controller-date-tools" style={{ marginBottom: 10 }}>
          {RANGES.map(([id, label]) => (
            <button
              key={id} type="button"
              className={`btn ${range === id ? "secondary" : "ghost"}`}
              onClick={() => setRange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <ArrivalBrief
          rows={[...q.importPending, ...q.importReady]}
          range={range} today={today()} onOpenJob={onOpenJob}
        />

        <div className="queue-tabs" role="tablist">
          {tabs.map(([id, label, n]) => (
            <button key={id} type="button" role="tab" className="queue-tab"
              aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}<span className="n">{n}</span>
            </button>
          ))}
        </div>

        <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>{MEANING[tab]}</p>

        {tab === "importPending" ? (
          <PendingByJob
            rows={q.importPending}
            onOpenJob={onOpenJob}
            onDischargeMany={onDischargeMany}
            onPortnet={onPortnet}
          />
        ) : tab === "importDelivered" ? (
          q.importDelivered.length ? (
            <table className="moves">
              <thead>
                <tr><th>Container</th><th>Job</th><th>Customer</th><th>Delivered</th><th /></tr>
              </thead>
              <tbody>
                {q.importDelivered.map(({ job, c }) => (
                  <tr key={`${job.id}-${c.id ?? c.ref}`}>
                    <td className="route">{c.number || c.ref}<span className="sub">{c.sizeType}</span></td>
                    <td>{job.id}</td>
                    <td>{job.customer || "Customer TBA"}</td>
                    <td>{day(c.deliveredAt)}</td>
                    <td>
                      <button className="btn secondary" type="button" onClick={() => onOpenJob(job)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="clean-empty">Nothing delivered and waiting on the customer.</div>
        ) : tab === "planned" ? (
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
            onDeliver={tab === "importReady" ? onDeliver : undefined}
            empty={
              tab === "importReady" ? "Nothing is released and discharged yet."
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
