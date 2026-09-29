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
/** Export containers that have left the controller's hands. */
const EXPORT_DONE = new Set(["Delivered to Port", "Completed"]);

/**
 * The CMS state of the empty collection for this export container, in the
 * words the board shows.
 *
 * Its own collection's status when it has one, the job's otherwise, which is
 * what a job with a single collection has always meant. Completing one
 * collection never reads as done for another.
 */
export function cmsWords(job, c) {
  const collections = (job.trips ?? []).filter((t) => t.type === "EMPTY_COLLECTION");
  const own = collections.find((t) => t.containerId && t.containerId === c.id)
    ?? (collections.length === 1 && !collections[0].containerId ? collections[0] : null);
  const status = own?.cmsStatus ?? (job.cmsCompleted ? "COMPLETED" : "PENDING");
  return status === "COMPLETED" || status === "NOT_REQUIRED" ? "CMS completed" : "CMS pending";
}

export function controllerQueues(jobs) {
  const containersOf = (job) => (job.containers ?? []).map((c) => ({ job, c }));
  const iso = today();

  // An import container reaches this board when it has been handed over, and
  // not before. Handover is the moment operations say the paperwork is done
  // and the box becomes the controller's problem; until then it is on the
  // operations screens and showing it here is showing work to somebody who
  // cannot yet act on it.
  //
  // It was not filtered at all. A job at 0/2 handed over put both its boxes on
  // this board, one of them offering Plan and Delivered while its permit was
  // still missing. Operations found it on 28 September 2026.
  //
  // Exports hand over as a job (0028), and are shown from then on whether or
  // not CMS is done: CMS often cannot be completed until the day the empty is
  // collected, and a job that only appeared once it was done would be hidden
  // for exactly the period the controller needs to plan around it.
  const all = jobs.flatMap(containersOf)
    .filter(({ job, c }) => (job.type === "Import" ? c.handedOver : Boolean(job.handedOverAt)));

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
      job.type === "Export" && !EXPORT_DONE.has(c.status ?? c.state)),
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
        // A release email names particular boxes far more often than a whole
        // job. Released is per container, and the same picker answers both
        // questions, so a box already discharged can still be picked for its
        // release.
        const unreleased = group.filter(({ c }) => !c.portnetReleasedAt);
        const pickedForRelease = unreleased.filter(({ c }) => picked.has(c.id)).map(({ c }) => c.id);

        return (
          <section className="card" key={job.id} style={{ marginBottom: 14 }}>
            <div className="clean-section-head">
              <div>
                <div className="section-title">
                  {job.id} · {job.vessel || "Vessel TBA"} · {group.length} container{group.length === 1 ? "" : "s"}
                </div>
                <div className="muted">
                  {job.customer || "Customer TBA"} · ETA {day(job.eta)} · Portnet release{" "}
                  {unreleased.length === 0 ? "Ready for all"
                    : unreleased.length === group.length ? "Pending for all"
                      : `Ready for ${group.length - unreleased.length} of ${group.length}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {unreleased.length > 0 ? (
                  <button className="btn secondary" type="button"
                    onClick={() => {
                      // Nothing ticked means the email covered the job, which
                      // is the ordinary case: one click releases every box.
                      onPortnet(job, pickedForRelease.length ? pickedForRelease : unreleased.map(({ c }) => c.id));
                      setPicked(new Set());
                    }}>
                    {pickedForRelease.length
                      ? `Portnet released: ${pickedForRelease.length} selected`
                      : unreleased.length < group.length
                        ? `Portnet released: remaining ${unreleased.length}`
                        : "Portnet released: all"}
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

            <ContainerTable rows={group} onOpenJob={onOpenJob}
              picked={picked} onToggle={toggle} />
          </section>
        );
      })}
    </>
  );
}

/**
 * One row per container, carrying what a controller scans for: the box, the
 * job under it, where it is going, whether it can leave the terminal, when it
 * is due and when free time runs out.
 *
 * Plan is shown on every row and disabled with the reason until the box is
 * released and discharged. The server refuses the same thing in the same
 * words, so the button cannot be the only thing standing in the way.
 */
function ContainerTable({ rows, onOpenJob, onDeliver, picked, onToggle, selectAll = false }) {
  return (
    <table className="moves">
      <thead>
        <tr>
          {onToggle ? <th /> : null}
          <th>Container</th><th>Customer</th><th>Vessel / ETA</th><th>Delivery address</th>
          <th>Portnet release</th><th>Discharge</th><th>Delivery date</th><th>Last free day</th><th />
        </tr>
      </thead>
      <tbody>
        {rows.map(({ job, c }) => {
          const done = c.portnetReleasedAt && c.dischargedAt;
          return (
            <tr key={`${job.id}-${c.id ?? c.ref}`}>
              {onToggle ? (
                <td>
                  {done && !selectAll ? null : (
                    <input
                      type="checkbox" checked={picked.has(c.id)}
                      onChange={() => onToggle(c.id)}
                      aria-label={`Select ${c.number || c.ref}`}
                      style={{ width: 16, height: 16 }}
                    />
                  )}
                </td>
              ) : null}
              <td className="route">
                {c.number || c.ref}
                <span className="sub">{c.sizeType || "Size not recorded"}</span>
                <span className="sub">{job.id}</span>
              </td>
              <td>{job.customer || "Customer TBA"}</td>
              <td>
                {job.vessel || "—"}<span className="sub">{day(job.eta)}</span>
                {job.terminal ? <span className="sub">{job.terminal}</span> : null}
              </td>
              <td>{c.containerDeliveryAddress || job.deliveryAddress || "Not recorded"}</td>
              <td>{c.portnetReleasedAt ? "Ready" : "Pending"}</td>
              <td>{c.dischargedAt ? "Ready" : "Pending"}</td>
              {/* The customer's date, and the controller's when it has been
                  brought forward. */}
              <td>
                {day(c.plannedDeliveryDate ?? c.requestedDeliveryDate)}
                <span className="sub">
                  {c.plannedDeliveryDate
                    ? `Requested ${day(c.requestedDeliveryDate)}`
                    : c.requestedDeliveryDate ? "As requested" : "Not given"}
                </span>
              </td>
              <td>{day(c.lastFreeDay)}</td>
              <td>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button className="btn secondary" type="button"
                    disabled={!c.canPlanCollection}
                    title={c.planBlockedReason ?? undefined}
                    onClick={() => onOpenJob(job)}>
                    Plan
                  </button>
                  {/* Only where the trip has happened: a container is marked
                      delivered once, by the person who knows it arrived. */}
                  {onDeliver && c.canPlanCollection ? (
                    <button className="btn ghost" type="button" onClick={() => onDeliver(job, c)}>
                      Delivered
                    </button>
                  ) : null}
                </div>
                {!c.canPlanCollection && c.planBlockedReason
                  ? <span className="sub">{c.planBlockedReason}</span> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Ready for collection, grouped by job, with the planned delivery date set in
 * bulk.
 *
 * Operations, 29 September 2026: the customer's requested date comes with the
 * job. Once a box is released and discharged the controller may send it
 * earlier, for every box on the job or the ones ticked, so a staggered
 * delivery is two actions rather than opening each container. Only ready
 * boxes are here, and the server refuses the rest in the same words.
 */
function ReadyByJob({ rows, onOpenJob, onDeliver, onSetDeliveryDate }) {
  const [picked, setPicked] = useState(() => new Set());
  const [dates, setDates] = useState({});

  if (!rows.length) return <div className="clean-empty">Nothing is released and discharged yet.</div>;

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
        const chosen = group.filter(({ c }) => picked.has(c.id)).map(({ c }) => c.id);
        const date = dates[job.id] ?? "";
        const apply = (ids) => {
          onSetDeliveryDate(job, ids, date);
          setPicked((was) => new Set([...was].filter((id) => !ids.includes(id))));
        };
        return (
          <section className="card" key={job.id} style={{ marginBottom: 14 }}>
            <div className="clean-section-head">
              <div>
                <div className="section-title">
                  {job.id} · {job.vessel || "Vessel TBA"} · {group.length} container{group.length === 1 ? "" : "s"}
                </div>
                <div className="muted">{job.customer || "Customer TBA"} · ETA {day(job.eta)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label className="muted" htmlFor={`dd-${job.id}`}>Planned delivery date</label>
                <input id={`dd-${job.id}`} type="date" className="app-date-input" value={date}
                  onChange={(e) => setDates((was) => ({ ...was, [job.id]: e.target.value }))} />
                <button className="btn secondary" type="button" disabled={!date || chosen.length === 0}
                  onClick={() => apply(chosen)}>
                  Set for {chosen.length || ""} selected
                </button>
                <button className="btn primary" type="button" disabled={!date}
                  onClick={() => apply(group.map(({ c }) => c.id))}>
                  Set for all {group.length}
                </button>
              </div>
            </div>
            <ContainerTable rows={group} onOpenJob={onOpenJob} onDeliver={onDeliver}
              picked={picked} onToggle={toggle} selectAll />
          </section>
        );
      })}
    </>
  );
}

/** Export containers, with the CMS state of the collection each one needs. */
function ExportTable({ rows, onOpenJob }) {
  if (!rows.length) return <div className="clean-empty">No export has been handed over yet.</div>;
  return (
    <table className="moves">
      <thead>
        <tr><th>Container</th><th>Customer</th><th>Vessel / ETA</th><th>Stuffing address</th>
          <th>Empty collection</th><th>Status</th><th /></tr>
      </thead>
      <tbody>
        {rows.map(({ job, c }) => {
          const cms = cmsWords(job, c);
          return (
            <tr key={`${job.id}-${c.id ?? c.ref}`}>
              <td className="route">
                {c.number || c.ref}
                <span className="sub">{c.sizeType || "Size not recorded"}</span>
                <span className="sub">{job.id}</span>
              </td>
              <td>{job.customer || "Customer TBA"}</td>
              <td>{job.vessel || "—"}<span className="sub">{day(job.eta)}</span></td>
              <td>{c.stuffingLocation || "Not recorded"}</td>
              {/* Beside the collection it blocks. Completed clears the blocker;
                  it does not mean the empty has been collected. */}
              <td>{job.emptyYard || "Yard not recorded"}<span className="sub">{cms}</span></td>
              <td>{c.status ?? c.state}</td>
              <td>
                <button className="btn secondary" type="button" onClick={() => onOpenJob(job)}>
                  {cms === "CMS pending" ? "Open" : "Plan"}
                </button>
                {cms === "CMS pending"
                  ? <span className="sub">A driver cannot be assigned until CMS is completed.</span> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}


export default function ZhtController({ jobs, fleet, onOpenJob, onDischargeMany, onPortnet, onDeliver, onSetDeliveryDate }) {
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
    ["exportReady", "Exports", q.exportReady.length],
    ["planned", "Planned today", q.planned.length],
  ];

  // Said once at the top of the pile, because four numbers and no explanation
  // makes a controller open rows to find out what the numbers mean.
  const MEANING = {
    importPending: "Waiting on Portnet release or discharge. Nothing can be collected yet.",
    importReady: "Released and discharged. A truck can be sent.",
    importDelivered: "At the customer. Waiting for them to finish with the box.",
    emptyReturns: "Finished with. Ready to plan the empty back to the depot.",
    exportReady: "Handed over. CMS pending blocks the driver for that empty collection, not the job.",
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
        ) : tab === "importReady" ? (
          <ReadyByJob rows={q.importReady} onOpenJob={onOpenJob} onDeliver={onDeliver}
            onSetDeliveryDate={onSetDeliveryDate} />
        ) : tab === "exportReady" ? (
          <ExportTable rows={q.exportReady} onOpenJob={onOpenJob} />
        ) : q[tab].length ? (
          <ContainerTable rows={q[tab]} onOpenJob={onOpenJob}
            onDeliver={tab === "importReady" ? onDeliver : undefined} />
        ) : (
          <div className="clean-empty">
            {tab === "importReady" ? "Nothing is released and discharged yet."
              : "No container is waiting to go back empty."}
          </div>
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
