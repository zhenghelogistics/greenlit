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

function PendingByJob({ rows, jobs, onOpenJob, onDischargeMany, onPortnet }) {
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
  const setMany = (ids, on) => setPicked((was) => {
    const next = new Set(was);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  });

  return (
    <>
      {[...byJob.values()].map((group) => {
        const job = group[0].job;
        const ids = group.map(({ c }) => c.id);
        const selected = group.filter(({ c }) => picked.has(c.id));
        // The job's handed-over boxes by stage, as the demo's header counts them.
        const all = ((jobs ?? []).find((j) => j.id === job.id)?.containers ?? job.containers ?? [])
          .filter((c) => c.handedOver);
        const count = (stage) => all.filter((c) => c.controllerStage === stage).length;

        // The demo's four actions. "Selected" with nothing ticked says so;
        // every one asks first, because a release or discharge is recorded as
        // a fact about the box.
        const apply = (kind, mode) => {
          const scope = mode === "all" ? group : selected;
          const targets = scope
            .filter(({ c }) => (kind === "portnet" ? !c.portnetReleasedAt : !c.dischargedAt))
            .map(({ c }) => c.id);
          if (mode === "selected" && selected.length === 0) {
            window.alert("Select at least one container in this job.");
            return;
          }
          if (targets.length === 0) {
            window.alert(kind === "portnet" ? "Those containers are already released." : "Those containers are already discharged.");
            return;
          }
          const label = kind === "portnet" ? "Portnet Release" : "Discharge";
          const where = mode === "all" ? `all pending containers in ${job.id}` : `selected containers in ${job.id}`;
          if (!window.confirm(`${label}: apply to ${where} (${targets.length})?`)) return;
          if (kind === "portnet") onPortnet(job, targets, mode); else onDischargeMany(job, targets, mode);
          setMany(targets, false);
        };

        return (
          <section className="card" key={job.id} style={{ marginBottom: 14 }}>
            <div className="clean-section-head">
              <div>
                <div className="section-title">
                  {job.id} · {job.vessel || "Vessel TBA"}{job.eta ? ` · ETA ${day(job.eta)}` : ""} · {all.length || group.length} container{(all.length || group.length) === 1 ? "" : "s"}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  <span className="tag">{group.length} Pending</span>
                  <span className="tag">{count("READY")} Ready</span>
                  {count("DELIVERED") ? <span className="tag">{count("DELIVERED")} Delivered</span> : null}
                  {count("EMPTY") ? <span className="tag">{count("EMPTY")} Empty</span> : null}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="tag">Selected {selected.length}</span>
                <button className="btn secondary" type="button" onClick={() => apply("portnet", "selected")}>Portnet · Selected</button>
                <button className="btn ghost" type="button" onClick={() => apply("portnet", "all")}>Portnet · All in Job</button>
                <button className="btn secondary" type="button" onClick={() => apply("discharge", "selected")}>Discharge · Selected</button>
                <button className="btn ghost" type="button" onClick={() => apply("discharge", "all")}>Discharge · All in Job</button>
              </div>
            </div>

            <ContainerTable rows={group} onOpenJob={onOpenJob}
              picked={picked} onToggle={toggle} selectAll
              allPicked={ids.length > 0 && ids.every((id) => picked.has(id))}
              onToggleAll={(on) => setMany(ids, on)}
              rowActions={{
                portnet: (c) => onPortnet(job, [c.id]),
                discharge: (c) => onDischargeMany(job, [c.id]),
              }} />
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
/** The open trip of this kind for this box, if one is planned. */
export function activeTrip(job, c, type) {
  return [...(job.trips ?? [])].reverse().find((t) =>
    t.containerId === c.id && t.type === type && !["CANCELLED", "COMPLETED"].includes(t.status));
}

function ContainerTable({
  rows, onOpenJob, onDeliver, onPlan, picked, onToggle, selectAll = false,
  allPicked = false, onToggleAll, rowActions,
}) {
  return (
    <table className="moves">
      <thead>
        <tr>
          {onToggle ? (
            <th>
              {onToggleAll ? (
                <input type="checkbox" checked={allPicked} aria-label="Select every container in this job"
                  onChange={(e) => onToggleAll(e.target.checked)} style={{ width: 16, height: 16 }} />
              ) : null}
            </th>
          ) : null}
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
              <td>{c.portnetReleasedAt ? "Released" : "Pending"}</td>
              <td>{c.dischargedAt ? "Discharged" : "Pending"}</td>
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
                {rowActions ? (
                  // Pending: each box can be released or discharged on its own.
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {!c.portnetReleasedAt ? (
                      <button className="btn secondary" type="button" onClick={() => rowActions.portnet(c)}>
                        Portnet Release
                      </button>
                    ) : null}
                    {!c.dischargedAt ? (
                      <button className="btn secondary" type="button" onClick={() => rowActions.discharge(c)}>
                        Discharge
                      </button>
                    ) : null}
                  </div>
                ) : (() => {
                  const trip = activeTrip(job, c, "IMPORT_DELIVERY");
                  return (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className={`btn ${trip ? "secondary" : "primary"}`} type="button"
                        disabled={!c.canPlanCollection}
                        title={c.planBlockedReason ?? undefined}
                        onClick={() => (onPlan ? onPlan(job, c, "IMPORT_DELIVERY", trip) : onOpenJob(job))}>
                        {trip ? "View / Replan" : "Plan"}
                      </button>
                      {/* Only once a trip is planned: the demo will not mark a
                          box delivered that nobody sent a truck for. */}
                      {onDeliver && trip ? (
                        <button className="btn ghost" type="button" onClick={() => onDeliver(job, c)}>
                          Delivered
                        </button>
                      ) : null}
                    </div>
                  );
                })()}
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
function ReadyByJob({ rows, onOpenJob, onDeliver, onSetDeliveryDate, onPlan }) {
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
            <ContainerTable rows={group} onOpenJob={onOpenJob} onDeliver={onDeliver} onPlan={onPlan}
              picked={picked} onToggle={toggle} selectAll />
          </section>
        );
      })}
    </>
  );
}

const dayTime = (v) => {
  if (!v) return "—";
  const at = new Date(v);
  if (Number.isNaN(at.getTime())) return day(v);
  const h = at.getHours(), m = String(at.getMinutes()).padStart(2, "0");
  return `${day(v)} ${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
};

/** Empty containers waiting to go back, with the return planned from here. */
function EmptyReturnsTable({ rows, onPlan }) {
  return (
    <table className="moves">
      <thead>
        <tr><th>Container</th><th>Chassis</th><th>Current location</th><th>Empty return yard</th><th /></tr>
      </thead>
      <tbody>
        {rows.map(({ job, c }) => {
          const trip = activeTrip(job, c, "EMPTY_RETURN");
          const delivery = [...(job.trips ?? [])].reverse()
            .find((t) => t.containerId === c.id && t.type === "IMPORT_DELIVERY");
          return (
            <tr key={`${job.id}-${c.id ?? c.ref}`}>
              <td className="route">{c.number || c.ref}<span className="sub">{job.id}</span></td>
              <td>{trip?.chassisId || delivery?.chassisId || "—"}</td>
              <td>{delivery?.destination || c.containerDeliveryAddress || job.deliveryAddress || "Not recorded"}</td>
              <td>{c.emptyReturnYard || "Not recorded"}</td>
              <td>
                <button className={`btn ${trip ? "secondary" : "primary"}`} type="button"
                  onClick={() => onPlan(job, c, "EMPTY_RETURN", trip)}>
                  {trip ? "View / Replan" : "Plan Return"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Half-hours, morning first, as every time on the demo is offered. */
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 ? "30" : "00";
  return { value: `${String(h).padStart(2, "0")}:${m}`, label: `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}` };
});

/**
 * Plan a trip for one container: who, with what, when, from where to where.
 *
 * The demo's Plan form. Driver, vehicle and chassis are all required, because
 * a trip without them is a row on a board rather than work anybody can do.
 * A chassis in maintenance is not offered. From and To start where the box
 * is and where it is going.
 */
function PlanForm({ target, jobs, fleet, drivers = [], onClose, onSave }) {
  const { job, c, type, trip } = target;
  const isReturn = type === "EMPTY_RETURN";
  const delivery = [...(job.trips ?? [])].reverse()
    .find((t) => t.containerId === c.id && t.type === "IMPORT_DELIVERY");
  const [form, setForm] = useState(() => ({
    driver: trip?.driver ?? "",
    truck: trip?.truck ?? "",
    chassisId: trip?.chassisId ?? (isReturn ? delivery?.chassisId ?? "" : ""),
    plannedDate: String(trip?.plannedDate ?? "").slice(0, 10)
      || (!isReturn ? String(c.plannedDeliveryDate ?? c.requestedDeliveryDate ?? "").slice(0, 10) : ""),
    plannedTime: trip?.plannedTime ?? "",
    origin: trip?.origin ?? (isReturn
      ? delivery?.destination || c.containerDeliveryAddress || job.deliveryAddress || ""
      : job.terminal || "PSA"),
    destination: trip?.destination ?? (isReturn
      ? c.emptyReturnYard || ""
      : c.containerDeliveryAddress || job.deliveryAddress || ""),
  }));
  const [problem, setProblem] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Names already used on trips, so the same driver is typed the same way.
  const used = (key) => [...new Set((jobs ?? []).flatMap((j) => (j.trips ?? []).map((t) => t[key])).filter(Boolean))].sort();
  // Drivers on file first, as the demo's list, then any name used on a trip.
  const onFile = drivers.filter((d) => d.active !== false);
  const driverNames = [...new Set([...onFile.map((d) => d.name), ...used("driver")])];
  const vehicleNames = [...new Set([...onFile.map((d) => d.vehicle).filter(Boolean), ...used("truck")])];
  const chassis = [...(fleet?.available ?? []), ...(fleet?.planned ?? []), ...(fleet?.inUse ?? [])].map((u) => u.unit);
  const chassisOptions = form.chassisId && !chassis.includes(form.chassisId) ? [form.chassisId, ...chassis] : chassis;

  const submit = (e) => {
    e.preventDefault();
    if (!form.driver.trim() || !form.truck.trim() || !form.chassisId) {
      setProblem("Please select Driver, Vehicle and Chassis before saving the plan.");
      return;
    }
    if (!form.origin.trim() || !form.destination.trim()) {
      setProblem("Say where the trip starts and where it ends.");
      return;
    }
    setProblem("");
    onSave(form);
  };

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(21,33,44,.35)", zIndex: 80,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form className="card" role="dialog" aria-modal="true" aria-labelledby="plan-title" onSubmit={submit}
        style={{ width: "min(640px, 100%)", maxHeight: "90vh", overflow: "auto" }}>
        <div className="section-title" id="plan-title">{isReturn ? "Plan Empty Return" : "Plan Import Delivery"}</div>
        <div className="muted" style={{ marginBottom: 12 }}>
          {c.number || c.ref} · {job.id} · {job.customer || "Customer TBA"}
        </div>
        <div className="formgrid">
          <label className="field-wrap"><span className="field-label">Driver *</span>
            <input id="plan-driver" list="plan-drivers" value={form.driver}
              onChange={(e) => {
                const name = e.target.value.toUpperCase();
                set("driver", name);
                // Picking a driver fills in the vehicle they normally drive.
                const known = onFile.find((d) => d.name === name);
                if (known?.vehicle && !form.truck) set("truck", known.vehicle);
              }} />
            <datalist id="plan-drivers">{driverNames.map((d) => <option key={d} value={d} />)}</datalist>
          </label>
          <label className="field-wrap"><span className="field-label">Vehicle *</span>
            <input id="plan-truck" list="plan-trucks" value={form.truck} onChange={(e) => set("truck", e.target.value.toUpperCase())} />
            <datalist id="plan-trucks">{vehicleNames.map((d) => <option key={d} value={d} />)}</datalist>
          </label>
          <label className="field-wrap"><span className="field-label">Chassis *</span>
            <select id="plan-chassis" value={form.chassisId} onChange={(e) => set("chassisId", e.target.value)}>
              <option value="">Select chassis</option>
              {chassisOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="field-wrap"><span className="field-label">Planned date</span>
            <input id="plan-date" type="date" className="app-date-input" value={form.plannedDate} onChange={(e) => set("plannedDate", e.target.value)} />
          </label>
          <label className="field-wrap"><span className="field-label">Planned time</span>
            <select id="plan-time" value={form.plannedTime} onChange={(e) => set("plannedTime", e.target.value)}>
              <option value="">Time not set</option>
              {HALF_HOURS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="field-wrap"><span className="field-label">From</span>
            <input id="plan-from" value={form.origin} onChange={(e) => set("origin", e.target.value)} />
          </label>
          <label className="field-wrap full"><span className="field-label">To</span>
            <input id="plan-to" value={form.destination} onChange={(e) => set("destination", e.target.value)} />
          </label>
        </div>
        {problem ? <div className="stop" role="alert" style={{ marginTop: 10 }}>{problem}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit">{trip ? "Save changes" : "Save plan"}</button>
        </div>
      </form>
    </div>
  );
}

const isoPlus = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/**
 * The demo's date tools on the Export page: Today, Tomorrow, the next 3 or 7
 * days after today, or one date, by ETA SIN. "All" shows every export.
 */
function ExportByDate({ rows, onOpenJob }) {
  const [range, setRange] = useState("all");
  const [on, setOn] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const windows = { today: [0, 0], tomorrow: [1, 1], three: [1, 3], seven: [1, 7] };
  const shown = rows.filter(({ job }) => {
    const eta = String(job.eta ?? "").slice(0, 10);
    if (range === "all") return true;
    if (range === "date") return !on || eta === on;
    const [from, to] = windows[range];
    return eta && eta >= isoPlus(today, from) && eta <= isoPlus(today, to);
  });
  return (
    <>
      <div className="controller-date-tools" style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[["all", "All"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["three", "Next 3 days"], ["seven", "Next 7 days"]].map(([id, label]) => (
          <button key={id} type="button" className={`btn ${range === id ? "secondary" : "ghost"}`}
            onClick={() => setRange(id)}>{label}</button>
        ))}
        <input id="export-date" type="date" className="app-date-input" value={on} aria-label="ETA SIN on"
          onChange={(e) => { setOn(e.target.value); setRange("date"); }} />
      </div>
      <ExportTable rows={shown} onOpenJob={onOpenJob} />
    </>
  );
}

/** Export containers, with the CMS state of the collection each one needs. */
function ExportTable({ rows, onOpenJob }) {
  if (!rows.length) return <div className="clean-empty">No export in this range.</div>;
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


export default function ZhtController({ jobs, fleet, drivers = [], onOpenPlanning, onOpenJob, onDischargeMany, onPortnet, onDeliver, onSetDeliveryDate, onPlan, onEmpty }) {
  const q = controllerQueues(jobs);
  // The Plan form, open on one container at a time.
  const [planning, setPlanning] = useState(null);
  const openPlan = (job, c, type, trip) => setPlanning({ job, c, type, trip: trip ?? null });
  const [tab, setTab] = useState("importPending");

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
      {/* The demo's four page cards: each opens its part of the board, and
          Planned Movements opens the Planning board. */}
      <div className="clean-metrics" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <button type="button" className={`clean-metric${["importPending", "importReady", "importDelivered"].includes(tab) ? " attention-soft" : ""}`}
          onClick={() => setTab("importReady")}>
          <span>Import Operations</span>
          <strong>{q.importReady.length}</strong>
          <small>{q.importPending.length} pending · {q.importReady.length} ready · {q.importDelivered.length} delivered</small>
        </button>
        <button type="button" className={`clean-metric${tab === "exportReady" ? " attention-soft" : ""}`}
          onClick={() => setTab("exportReady")}>
          <span>Export Collection</span>
          <strong>{q.exportReady.filter(({ job, c }) => cmsWords(job, c) === "CMS completed").length}</strong>
          <small>CMS done, ready for empty collection</small>
        </button>
        <button type="button" className={`clean-metric${tab === "emptyReturns" ? " attention-soft" : ""}`}
          onClick={() => setTab("emptyReturns")}>
          <span>Empty Returns</span>
          <strong>{q.emptyReturns.length}</strong>
          <small>Finished with, waiting to go back</small>
        </button>
        <button type="button" className="clean-metric" onClick={() => onOpenPlanning?.()}>
          <span>Planned Movements</span>
          <strong>{jobs.flatMap((j) => j.trips ?? []).filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status)).length}</strong>
          <small>Open movements, dated or not</small>
        </button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="section-title">Controller job board</div>
        <div className="muted">
          Jobs stay visible by movement, so trips can be chained and empty running reduced.
        </div>

        {/* The arrival summary and its date buttons were here. The demo took
            them off the board (v12.120): vessel and ETA belong to the job. */}

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
            jobs={jobs}
            onOpenJob={onOpenJob}
            onDischargeMany={onDischargeMany}
            onPortnet={onPortnet}
          />
        ) : tab === "importDelivered" ? (
          q.importDelivered.length ? (
            <table className="moves">
              <thead>
                <tr><th>Container</th><th>Customer / Current location</th><th>Chassis</th><th>Delivered</th><th /></tr>
              </thead>
              <tbody>
                {q.importDelivered.map(({ job, c }) => {
                  const trip = [...(job.trips ?? [])].reverse()
                    .find((t) => t.containerId === c.id && t.type === "IMPORT_DELIVERY");
                  return (
                    <tr key={`${job.id}-${c.id ?? c.ref}`}>
                      <td className="route">{c.number || c.ref}<span className="sub">{job.id}</span></td>
                      <td>{trip?.destination || c.containerDeliveryAddress || job.deliveryAddress || "Not recorded"}
                        <span className="sub">{job.customer || "Customer TBA"}</span></td>
                      <td>{trip?.chassisId || "—"}</td>
                      <td>{dayTime(c.deliveredAt)}</td>
                      <td>
                        {/* The customer has finished with it: it moves to
                            Empty Returns, where the return is planned. */}
                        <button className="btn primary" type="button" onClick={() => onEmpty?.(job, c)}>
                          Empty
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
            onSetDeliveryDate={onSetDeliveryDate} onPlan={openPlan} />
        ) : tab === "exportReady" ? (
          <ExportByDate rows={q.exportReady} onOpenJob={onOpenJob} />
        ) : q[tab].length ? (
          <EmptyReturnsTable rows={q[tab]} onPlan={openPlan} />
        ) : (
          <div className="clean-empty">No container is waiting to go back empty.</div>
        )}
      </div>

      {planning ? (
        <PlanForm target={planning} jobs={jobs} fleet={fleet} drivers={drivers}
          onClose={() => setPlanning(null)}
          onSave={async (plan) => {
            const ok = await onPlan?.(planning.job, planning.c, planning.type, planning.trip, plan);
            if (ok !== false) setPlanning(null);
          }} />
      ) : null}

      {/* "Today's fleet plan" was here. The demo removed its Fleet Plan
          (v12.100); where drivers are is the Drivers & Vehicles screen. */}
      </div>
    </div>
  );
}
