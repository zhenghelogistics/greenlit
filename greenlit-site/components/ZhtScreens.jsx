"use client";

import { useEffect, useState } from "react";

/**
 * The remaining nine screens, in the PM's markup.
 *
 * Four of his — Planning Board, Drivers & Vehicles, Chassis Master and Billing
 * Ready — are hardcoded rows in the demo: "Tan BM", "Ravi", "$320 + Tri-axle
 * $80", against job numbers that do not exist. His layout is kept and the rows
 * are read from what we actually hold, because a billing screen quoting
 * invented dollar amounts in a system people are about to run jobs on is not a
 * design decision, it is a wrong number with a currency symbol in front of it.
 *
 * Where we genuinely hold nothing yet the screen says so in his empty state
 * rather than filling itself in.
 */

const fmt = (value) => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const Shell = ({ title, note, action, children }) => (
  <div className="zht">
    <div className="content">
      <section className="view active">
        <div className="header-row">
          <div><h2>{title}</h2>{note ? <div className="muted">{note}</div> : null}</div>
          {action}
        </div>
        {children}
      </section>
    </div>
  </div>
);

const Empty = ({ children }) => <div className="clean-empty">{children}</div>;

/** §26. Every job, filterable by domain — his toolbar, our register. */
export function ZhtJobs({ jobs, onOpenJob, onNewJob }) {
  const [type, setType] = useState("");
  const rows = jobs.filter((j) => !type || j.type === type);

  return (
    <Shell title="Jobs"
      action={<button className="btn primary" type="button" onClick={onNewJob}>+ New Job</button>}>
      <div className="card">
        <div className="toolbar">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All Types</option>
            <option value="Import">Import</option>
            <option value="Export">Export</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Job</th><th>Type</th><th>Customer</th><th>Containers</th>
              <th>Vessel / Voyage</th><th>Permit</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((job) => (
              <tr key={job.id}>
                <td><button type="button" className="job-link" onClick={() => onOpenJob(job)}>{job.id}</button></td>
                <td>{job.type}</td>
                <td>{job.customer || "Customer TBA"}</td>
                <td>{(job.containers ?? []).length}</td>
                <td>{job.vessel || "—"}</td>
                <td>{job.permitRequired ? (job.permitReceived ? "Received" : "Outstanding") : "Not required"}</td>
                <td>{job.derived?.status ?? "—"}</td>
              </tr>
            )) : (
              <tr><td colSpan={7}><Empty>No jobs yet.</Empty></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/**
 * §21.3.2. His board, one row per vehicle.
 *
 * His version lists three named drivers against fixed movements. This reads the
 * movements actually assigned, grouped by the truck carrying them, so a vehicle
 * appears here exactly when something is booked on it.
 */
export function ZhtPlanning({ jobs, onOpenJob }) {
  const byVehicle = new Map();
  for (const job of jobs) {
    for (const trip of job.trips ?? []) {
      if (!trip.truck) continue;
      if (!byVehicle.has(trip.truck)) byVehicle.set(trip.truck, []);
      byVehicle.get(trip.truck).push({ trip, job });
    }
  }
  const vehicles = [...byVehicle.entries()];

  return (
    <Shell title="Planning Board">
      <div className="card">
        <div className="section-title">Movement-Based Planning</div>
        {vehicles.length ? (
          <div className="board">
            <div><b>Driver</b></div><div><b>Movement 1</b></div>
            <div><b>Movement 2</b></div><div><b>Movement 3</b></div><div><b>Next</b></div>
            {vehicles.map(([truck, entries]) => {
              const slots = [0, 1, 2].map((i) => entries[i]);
              return (
                <ZhtPlanningRow key={truck} truck={truck} entries={entries}
                  slots={slots} onOpenJob={onOpenJob} />
              );
            })}
          </div>
        ) : (
          <Empty>No movements are assigned to a vehicle yet.</Empty>
        )}
      </div>
    </Shell>
  );
}

function ZhtPlanningRow({ truck, entries, slots, onOpenJob }) {
  const driver = entries[0]?.trip.driver;
  return (
    <>
      <div><b>{driver || "Unassigned"}</b><br /><small>{truck}</small></div>
      {slots.map((entry, i) => entry ? (
        <div key={i}>
          <button type="button" className="job-link" onClick={() => onOpenJob(entry.job)}>
            {entry.job.id}
          </button>
          <br /><small>{entry.trip.origin} → {entry.trip.destination}</small>
        </div>
      ) : <div className="muted" key={i}>Available</div>)}
      <div className="muted">{entries.length > 3 ? `+${entries.length - 3} more` : "Available"}</div>
    </>
  );
}

/**
 * §21.3. Who is out, and on what.
 *
 * Read from the fleet view's vehicle engagements, which is the same derivation
 * the schedule uses — so a truck held on standby shows as engaged here rather
 * than as free.
 */
export function ZhtDrivers({ fleet }) {
  const engagements = fleet?.vehicles ?? [];
  const byTruck = new Map();
  for (const e of engagements) {
    if (!byTruck.has(e.truck)) byTruck.set(e.truck, []);
    byTruck.get(e.truck).push(e);
  }

  return (
    <Shell title="Drivers &amp; Vehicles"
      note="A vehicle is engaged while in transit or held on standby.">
      <div className="card">
        <table>
          <thead>
            <tr><th>Driver</th><th>Vehicle</th><th>Current Movement</th><th>For</th><th>Status</th></tr>
          </thead>
          <tbody>
            {byTruck.size ? [...byTruck.entries()].map(([truck, list]) => {
              const now = list[0];
              const hours = now.minutes >= 60
                ? `${Math.floor(now.minutes / 60)}h ${now.minutes % 60}m`
                : `${now.minutes}m`;
              return (
                <tr key={truck}>
                  <td>{now.driver || "Unassigned"}</td>
                  <td>{truck}</td>
                  <td>{now.movementRef}</td>
                  <td>{hours}{now.openEnded ? " · no release recorded" : ""}</td>
                  <td>
                    <span className={`tag ${now.reason === "ON_STANDBY" ? "pending" : "green"}`}>
                      {now.reason === "ON_STANDBY" ? "On Standby" : "On Job"}
                    </span>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={5}><Empty>No vehicle is currently engaged.</Empty></td></tr>
            )}
          </tbody>
        </table>
        {fleet?.vehicleClashes?.length ? (
          <div className="callout" style={{ marginTop: 12 }}>
            {fleet.vehicleClashes.length} vehicle{fleet.vehicleClashes.length === 1 ? " is" : "s are"} booked twice at once.
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

/** §35. The chassis master, from the fleet view where status is derived. */
export function ZhtChassis({ fleet, onOpenJob, onUnit }) {
  const units = [...(fleet?.inUse ?? []), ...(fleet?.available ?? []), ...(fleet?.maintenance ?? [])];
  return (
    <Shell title="Chassis Master"
      note={fleet?.availability ? `${units.length} units on record.` : undefined}>
      <div className="card">
        <table>
          <thead>
            <tr><th>Chassis</th><th>Compatibility</th><th>Status</th><th>Current Job</th><th>Days Held</th><th>Action</th></tr>
          </thead>
          <tbody>
            {units.length ? units.map((u) => (
              <tr key={u.unit}>
                <td>{u.unit}</td>
                <td>{u.size}</td>
                <td>
                  <span className={`tag ${u.status === "IN_USE" ? "green" : u.status === "AVAILABLE" ? "ready" : "gray"}`}>
                    {u.status === "IN_USE" ? "In Use" : u.status === "AVAILABLE" ? "Available" : "Maintenance"}
                  </span>
                </td>
                <td>{u.jobId ? <button type="button" className="job-link" onClick={() => onOpenJob({ id: u.jobId })}>{u.jobId}</button> : "-"}</td>
                <td>{u.days || 0}</td>
                {/* §35.4. Assign and release live behind the same drawer the
                    old fleet screen opened; a read-only table would have made
                    them unreachable. */}
                <td>
                  <button className="btn secondary" type="button"
                    onClick={() => onUnit({ unit: u.unit, size: u.size, jobId: u.jobId,
                      condition: u.status === "IN_USE" ? "assigned"
                        : u.status === "AVAILABLE" ? "available" : "maintenance" })}>
                    Manage
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6}><Empty>No chassis on record.</Empty></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/**
 * §34.0. What is chargeable, and what it is estimated to cost.
 *
 * His Billing Ready lists transport rates — "$320 + Tri-axle $80" — which this
 * system does not hold: there is no transport tariff anywhere in it, and
 * inventing one would put a figure on screen that reads as authoritative and
 * is fiction.
 *
 * What it does hold is the §34.0 charge estimate: carrier free-time days
 * already over, times the daily rate on the container. That is a real number
 * with a real basis, so it is the one shown, and it says which it is.
 */
export function ZhtBilling({ jobs, onOpenJob }) {
  const rows = [];
  for (const job of jobs) {
    for (const container of job.containers ?? []) {
      if (!container.charge || container.charge.chargeableDays === 0) continue;
      rows.push({ job, container, charge: container.charge });
    }
  }

  return (
    <Shell title="Billing Ready"
      note="Demurrage and detention exposure. Transport rates are not held in this system.">
      <div className="card">
        <table>
          <thead>
            <tr><th>Job</th><th>Container</th><th>Chargeable Days</th><th>Estimated Charge</th><th>Basis</th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(({ job, container, charge }) => (
              <tr key={`${job.id}-${container.id ?? container.ref}`}>
                <td><button type="button" className="job-link" onClick={() => onOpenJob(job)}>{job.id}</button></td>
                <td>{container.number || container.ref}</td>
                <td>{charge.chargeableDays}</td>
                <td>
                  {charge.amount === null
                    ? <span className="tag pending">No rate on file</span>
                    : `${charge.currency} ${charge.amount.toFixed(2)}`}
                </td>
                <td><small className="muted">{charge.summary}</small></td>
              </tr>
            )) : (
              <tr><td colSpan={5}><Empty>Nothing is past its carrier free time.</Empty></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/** §36.3. Containers in the empty-return stage. */
export function ZhtEmptyReturns({ jobs, onOpenJob }) {
  const rows = [];
  for (const job of jobs) {
    for (const trip of job.trips ?? []) {
      if (trip.type !== "EMPTY_RETURN" || trip.status === "COMPLETED") continue;
      rows.push({ job, trip });
    }
  }

  return (
    <Shell title="Empty Returns" note="Containers currently in the empty-return stage.">
      <div className="card">
        {rows.length ? rows.map(({ job, trip }) => (
          <div className="movement" key={`${job.id}-${trip.id}`}>
            <strong>
              <button type="button" className="job-link" onClick={() => onOpenJob(job)}>{job.id}</button>
            </strong>
            {trip.origin} → {trip.destination}
            <br />
            <span className="muted">
              {trip.status}{trip.plannedDate ? ` · planned ${fmt(trip.plannedDate)}` : ""}
              {job.emptyYard ? ` · ${job.emptyYard}` : ""}
            </span>
          </div>
        )) : <Empty>No containers are awaiting empty return.</Empty>}
      </div>
    </Shell>
  );
}

/** §9. The customer master. */
export function ZhtCustomers({ onOpenCustomer }) {
  const [state, setState] = useState({ loading: true, customers: [] });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled) setState({ loading: false, customers: d.customers ?? [] }); })
      .catch(() => { if (!cancelled) setState({ loading: false, customers: [] }); });
    return () => { cancelled = true; };
  }, []);

  const needle = query.trim().toLowerCase();
  const rows = state.customers.filter((c) => !needle
    || [c.companyName, c.code, c.shortName, c.defaultDeliveryAddress, c.notes]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)));

  return (
    <Shell title="Customer Master">
      <div className="customer-master-search card">
        <div className="customer-search-main">
          <div>
            <div className="section-title">Customer Master Search</div>
            <div className="muted">Search customer name, code, delivery company, address or instructions.</div>
          </div>
          <div className="customer-search-controls">
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers, companies, addresses..." />
            <button type="button" className="btn ghost" onClick={() => setQuery("")}>Clear</button>
          </div>
        </div>
        <div className="customer-search-summary">
          {state.loading ? "Loading…" : `${rows.length} of ${state.customers.length} customers`}
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Customer</th><th>Code</th><th>Default Address</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((c) => (
              <tr key={c.customerId ?? c.code}>
                <td>{c.companyName}</td>
                <td>{c.code}</td>
                <td>{c.defaultDeliveryAddress || "—"}</td>
                <td>{c.accountStatus}</td>
                <td>
                  <button className="btn secondary" type="button" onClick={() => onOpenCustomer(c.code)}>
                    Open
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5}><Empty>
                {state.loading ? "Loading…" : "No customers on record yet."}
              </Empty></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/** §9 and §9.3. One customer: profile, its locations, instructions, history. */
export function ZhtCustomerDetail({ code, onBack }) {
  const [tab, setTab] = useState("profile");
  const [state, setState] = useState({ loading: true, customer: null, locations: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/customers/${encodeURIComponent(code)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/customers/${encodeURIComponent(code)}/locations`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([c, l]) => {
      if (cancelled) return;
      setState({ loading: false, customer: c?.customer ?? null, locations: l?.locations ?? [] });
    }).catch(() => { if (!cancelled) setState({ loading: false, customer: null, locations: [] }); });
    return () => { cancelled = true; };
  }, [code]);

  const c = state.customer;
  const tabs = [["profile", "Profile"], ["locations", "Delivery Companies & Addresses"],
                ["instructions", "Operational Instructions"], ["history", "Change History"]];

  return (
    <Shell title={c?.companyName || code}
      action={<button className="btn secondary" type="button" onClick={onBack}>← Back</button>}>
      <div className="card">
        <div className="tabs">
          {tabs.map(([id, label]) => (
            <button type="button" key={id} className={`tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "profile" ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">Customer Profile</div>
          <div className="formgrid">
            {[["Company", c?.companyName], ["Code", c?.code], ["Short name", c?.shortName],
              ["Billing name", c?.billingName], ["Default consignee", c?.defaultConsignee],
              ["Default address", c?.defaultDeliveryAddress], ["Contact", c?.defaultContact],
              ["Email domains", (c?.emailDomains ?? []).join(", ")],
              ["Status", c?.accountStatus]].map(([label, value]) => (
                <div className="field" key={label}>
                  <span className="field-label">{label}</span><b>{value || "—"}</b>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {tab === "locations" ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">Delivery Companies &amp; Addresses</div>
          <div className="location-card-list">
            {state.locations.length ? state.locations.map((loc) => (
              <div className="location-card" key={loc.locationId}>
                <b>{loc.companyName}</b>
                {loc.isDefault ? <span className="tag green" style={{ marginLeft: 8 }}>Default</span> : null}
                <br />{loc.address}
                {loc.notes ? <><br /><span className="muted">{loc.notes}</span></> : null}
              </div>
            )) : <Empty>
              {state.loading ? "Loading…" : "No delivery locations recorded for this customer."}
            </Empty>}
          </div>
        </div>
      ) : null}

      {tab === "instructions" ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">Operational Instructions</div>
          <div className="muted">{c?.notes || "No standing instructions recorded."}</div>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">Change History</div>
          {/* §13. Customer-level audit is not exposed by the API yet, so this
              says so rather than showing an empty list that reads as "nothing
              has ever changed". */}
          <Empty>Customer change history is not published by the API yet.</Empty>
        </div>
      ) : null}
    </Shell>
  );
}

/** Global search across jobs, containers and customers. */
export function ZhtSearchResults({ jobs, query, onOpenJob, onBack }) {
  const needle = (query ?? "").trim().toLowerCase();
  const hits = !needle ? [] : jobs.filter((j) =>
    [j.id, j.customer, j.vessel, j.booking, j.billOfLading, j.container]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))
    || (j.containers ?? []).some((c) => String(c.number ?? "").toLowerCase().includes(needle)));

  return (
    <Shell title="Search Results" note={needle ? `${hits.length} for “${query}”` : "Type to search."}
      action={<button className="btn secondary" type="button" onClick={onBack}>← Back</button>}>
      <div className="card">
        {hits.length ? hits.map((job) => (
          <div className="movement" key={job.id}>
            <strong>
              <button type="button" className="job-link" onClick={() => onOpenJob(job)}>{job.id}</button>
            </strong>
            {job.customer || "Customer TBA"}
            <br />
            <span className="muted">
              {job.type} · {job.vessel || "no vessel"} · {job.derived?.status ?? ""}
            </span>
          </div>
        )) : <Empty>{needle ? "Nothing matched." : "Type a job number, container or customer."}</Empty>}
      </div>
    </Shell>
  );
}
