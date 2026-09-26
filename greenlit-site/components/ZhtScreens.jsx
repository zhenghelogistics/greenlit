"use client";

import { useEffect, useState } from "react";
import { SectionNav } from "./ZhtNewJob.jsx";

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
  const [docs, setDocs] = useState("");

  // Two questions a person actually opens this list to ask: what is still
  // being chased, and what is finished and can be handed on. Neither is
  // answerable from the operational status, which is about where the box is.
  const rows = jobs.filter((j) => {
    if (type && j.type !== type) return false;
    if (docs === "outstanding" && (j.documentGaps ?? []).length === 0) return false;
    if (docs === "ready" && (j.documentGaps ?? []).length > 0) return false;
    return true;
  });

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
          <select value={docs} onChange={(e) => setDocs(e.target.value)}>
            <option value="">Any document status</option>
            <option value="outstanding">Information outstanding</option>
            <option value="ready">Documents ready</option>
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
export function ZhtPlanning({ jobs, fleet, onOpenJob }) {
  const byVehicle = new Map();
  for (const job of jobs) {
    for (const trip of job.trips ?? []) {
      if (!trip.truck) continue;
      if (!byVehicle.has(trip.truck)) byVehicle.set(trip.truck, []);
      byVehicle.get(trip.truck).push({ trip, job });
    }
  }
  const vehicles = [...byVehicle.entries()];

  // The board groups by truck, so a movement with no truck on it appeared
  // nowhere: planned, invisible, and nobody doing it. They are listed first,
  // because an unassigned trip is the only thing on this screen that needs
  // somebody to act before the day can run.
  const unassigned = jobs.flatMap((job) =>
    (job.trips ?? [])
      .filter((t) => (t.unassigned ?? []).length > 0 && t.status !== "CANCELLED")
      .map((trip) => ({ trip, job })));

  return (
    <Shell title="Planning Board">
      {unassigned.length ? (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--gl-state-warn)" }}>
          <div className="section-title">
            Waiting on an assignment · {unassigned.length}
          </div>
          <div className="muted">
            Planned, but nobody is doing them yet. Each is missing what it says.
          </div>
          <div style={{ marginTop: 10 }}>
            {unassigned.map(({ trip, job }, i) => (
              <div className="movement" key={`${job.id}-${trip.id}-${i}`}>
                <strong>{trip.type}</strong>
                {trip.origin} → {trip.destination}
                <br />
                <span className="muted">
                  <button className="btn ghost" type="button" onClick={() => onOpenJob(job)}>
                    {job.id}
                  </button>
                  {trip.plannedDate ? ` · ${trip.plannedDate}` : " · no date"}
                  {" · needs "}{trip.unassigned.join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {/* §17. The thing a controller reading job by job cannot see: a truck
          already committed to finish where some other job needs one to start.
          An empty leg is a truck, a driver and a slot on the day, paid for and
          carrying nothing.

          Offered, never taken. Whether the chain works depends on timing, the
          customer's window and the driver's shift, and those are the
          controller's to weigh. */}
      {(fleet?.routeOpportunities ?? []).length ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">Route Opportunities</div>
          <div className="muted">
            A committed movement ends where another is waiting to start. Same
            location only — a near match sends a truck to the wrong gate.
          </div>
          <div style={{ marginTop: 10 }}>
            {fleet.routeOpportunities.slice(0, 8).map((o, i) => (
              <div className="movement" key={i}>
                <strong>{o.finishing.truck || "Truck TBA"}</strong>
                {o.finishing.origin} → {o.finishing.destination}
                <br />
                <span className="muted">
                  {o.finishing.movementRef} ends at {o.at}, where{" "}
                  {o.waiting.movementRef} starts ({o.waiting.origin} → {o.waiting.destination})
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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

/** §9. The customer master, in his markup. Ours can also create one. */
export function ZhtCustomers({ onOpenCustomer }) {
  const [state, setState] = useState({ loading: true, customers: [] });
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  function load() {
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setState({ loading: false, customers: d.customers ?? [] }))
      .catch(() => setState({ loading: false, customers: [] }));
  }
  useEffect(load, []);

  const needle = query.trim().toLowerCase();
  const rows = state.customers.filter((c) => !needle
    || [c.companyName, c.code, c.shortName, c.defaultDeliveryAddress, c.notes]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)));

  return (
    <Shell title="Customer Master"
      action={<button className="btn primary" type="button" onClick={() => setAdding(true)}>+ Add Customer</button>}>
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

      {adding ? (
        <AddCustomer onCancel={() => setAdding(false)}
          onSaved={(created) => {
            setAdding(false);
            load();
            if (created) onOpenCustomer?.(created);
          }} />
      ) : null}

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
                  <button className="btn secondary" type="button" onClick={() => onOpenCustomer(c.code)}>Open</button>
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

/** §9.1. The code is chosen by a person and immutable once issued. */
/**
 * One address on a customer's record, as a set of fields.
 *
 * The same component whether it is being added or corrected, because the two
 * are the same work and operations were doing one of them by creating a second
 * record. It was add-only before: a saved location offered "make default" and
 * "take out of use", and no way at all to fix a typo in the address.
 */
function LocationFields({ value, onChange, customerName }) {
  const set = (key) => (event) => onChange({
    ...value,
    [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
  });

  return (
    <div className="job-create-grid formgrid">
      <label className="field">
        <span className="field-label">Company at this address</span>
        <input
          value={value.company} onChange={set("company")}
          placeholder={customerName || "The company receiving the container"}
        />
        <span className="field-helper">
          Usually one of this customer&rsquo;s own customers. Leave it blank for
          {customerName ? ` ${customerName}` : " the customer"} itself.
        </span>
      </label>
      <label className="field">
        <span className="field-label">Site name</span>
        <input value={value.label} onChange={set("label")} placeholder="Tuas warehouse" required />
        <span className="field-helper">What someone says on the phone.</span>
      </label>
      <label className="field full">
        <span className="field-label">Address</span>
        <input value={value.address} onChange={set("address")} required
          placeholder="12 Jurong Port Road, Singapore 619098" />
      </label>
      <label className="field full">
        <span className="field-label">Operational instructions</span>
        <textarea
          rows={2} value={value.operationalInstructions} onChange={set("operationalInstructions")}
          placeholder="Gate 3 only. Call site office 30 minutes ahead. Forklift before 12pm."
        />
        {/* Shown on the job the moment this address is chosen, which is the
            whole point of keeping it here rather than in somebody's head. */}
        <span className="field-helper">
          Shown when this address is picked on a job. A job can still add
          something for one delivery without changing this.
        </span>
      </label>
      <div className="field full">
        <div className="action-row" style={{ gap: 14, flexWrap: "wrap" }}>
          <label className="checkline">
            <input type="checkbox" checked={value.isDefault} onChange={set("isDefault")} />
            <span>Default for this customer</span>
          </label>
          <label className="checkline">
            <input type="checkbox" checked={value.doubleMountingPermitted}
              onChange={set("doubleMountingPermitted")} />
            <span>Double mounting permitted</span>
          </label>
          <label className="checkline">
            <input type="checkbox" checked={value.standbyUsual} onChange={set("standbyUsual")} />
            <span>Standby usual here</span>
          </label>
        </div>
      </div>
    </div>
  );
}

/** A location nobody has saved yet. */
const BLANK_LOCATION = {
  company: "", label: "", address: "", operationalInstructions: "",
  isDefault: false, doubleMountingPermitted: true, standbyUsual: false,
};

/**
 * Create a customer, and everything about it, in one pass.
 *
 * It asked for three fields — code, company name, short name — and made a
 * record you then had to open and fill in field by field, screen by screen.
 * Operations described that exactly: *"what customer creation is doing is to
 * just build the main folder. Once main folder is built, then I must enter the
 * folder to amend the relevant fields individually."*
 *
 * So: the same shape as job creation. Sections across the top, one open at a
 * time, and the addresses are here rather than behind a second visit — a new
 * customer almost always arrives with at least one.
 *
 * Several addresses before anything is saved, because they arrive together.
 * Operations were clicking Add Location, saving, and clicking it again for
 * each one.
 */
function AddCustomer({ onCancel, onSaved }) {
  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState({
    code: "", companyName: "", shortName: "", billingName: "",
    defaultContact: "", emailDomains: "", notes: "",
  });
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const sections = [
    { id: "profile", label: "Profile", outstanding: !form.code.trim() || !form.companyName.trim() },
    {
      id: "locations",
      label: "Delivery Companies & Addresses",
      outstanding: locations.some((l) => !l.label.trim() || !l.address.trim()),
    },
  ];

  async function submit(event) {
    event.preventDefault();
    if (!form.code.trim() || !form.companyName.trim()) {
      setTab("profile");
      setError("A code and a company name are required.");
      return;
    }
    const unfinished = locations.findIndex((l) => !l.label.trim() || !l.address.trim());
    if (unfinished >= 0) {
      setTab("locations");
      setError(`Address ${unfinished + 1} needs a site name and an address.`);
      return;
    }

    setSaving(true);
    setError("");
    const code = form.code.trim().toUpperCase();

    const created = await fetch("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        companyName: form.companyName.trim(),
        shortName: form.shortName.trim() || null,
        emailDomains: form.emailDomains.split(/[,\s]+/).map((d) => d.trim()).filter(Boolean),
      }),
    }).catch(() => null);
    const payload = await created?.json().catch(() => ({}));
    if (!created?.ok) {
      setSaving(false);
      setTab("profile");
      setError(payload?.error ?? "That customer was not saved.");
      return;
    }

    // The rest of the profile in one amendment, because creation takes only
    // what makes a customer exist and the rest is a correction to it.
    const rest = {};
    if (form.billingName.trim()) rest.billingName = form.billingName.trim();
    if (form.defaultContact.trim()) rest.defaultContact = form.defaultContact.trim();
    if (form.notes.trim()) rest.notes = form.notes.trim();
    if (Object.keys(rest).length) {
      await fetch(`/api/customers/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rest),
      }).catch(() => null);
    }

    // One at a time, in order: each writes its own history line, and a failure
    // halfway should leave the ones already saved saved rather than rolled
    // back into nothing.
    const failed = [];
    for (const [index, site] of locations.entries()) {
      const response = await fetch(`/api/customers/${encodeURIComponent(code)}/locations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(site),
      }).catch(() => null);
      if (!response?.ok) failed.push(site.label || `Address ${index + 1}`);
    }

    setSaving(false);
    if (failed.length) {
      setTab("locations");
      setError(
        `${code} was created, but ${failed.join(", ")} could not be saved. `
        + "Add them from the customer's own screen.",
      );
      return;
    }
    onSaved(code);
  }

  return (
    <form className="zht" onSubmit={submit} style={{ marginTop: 12 }}>
      <SectionNav sections={sections} current={tab} onJump={setTab} />
      {error ? <div className="callout" role="alert">{error}</div> : null}

      {tab === "profile" ? (
        <section className="creation-section">
          <div className="creation-section-head">
            <div>
              <div className="section-title">Profile</div>
              <div className="muted">The code cannot be changed later. Everything else can.</div>
            </div>
          </div>
          <div className="job-create-grid formgrid">
            <div className="field">
              <label htmlFor="zht-cust-code">Code<span className="req"> *</span></label>
              <input id="zht-cust-code" required value={form.code} maxLength={6}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="ABC" />
              <span className="field-helper">
                Every job number for this customer is built from it, so it is issued once.
              </span>
            </div>
            <div className="field">
              <label htmlFor="zht-cust-name">Company name<span className="req"> *</span></label>
              <input id="zht-cust-name" required value={form.companyName}
                onChange={set("companyName")} placeholder="ABC Pte Ltd" />
            </div>
            <div className="field">
              <label htmlFor="zht-cust-short">Short name</label>
              <input id="zht-cust-short" value={form.shortName} onChange={set("shortName")} />
            </div>
            <div className="field">
              <label htmlFor="zht-cust-billing">Billing name</label>
              <input id="zht-cust-billing" value={form.billingName} onChange={set("billingName")} />
              <span className="field-helper">Only if the invoice reads differently.</span>
            </div>
            <div className="field">
              <label htmlFor="zht-cust-contact">Contact</label>
              <input id="zht-cust-contact" value={form.defaultContact} onChange={set("defaultContact")} />
            </div>
            <div className="field">
              <label htmlFor="zht-cust-domains">Email domains</label>
              <input id="zht-cust-domains" value={form.emailDomains} onChange={set("emailDomains")}
                placeholder="abc.com.sg, abc-logistics.com" />
              <span className="field-helper">
                How an arrival notice is matched to this customer automatically.
              </span>
            </div>
            <div className="field full">
              <label htmlFor="zht-cust-notes">Account notes</label>
              <textarea id="zht-cust-notes" rows={2} value={form.notes} onChange={set("notes")} />
              <span className="field-helper">
                About the account. Instructions for a place go on its address.
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "locations" ? (
        <section className="creation-section">
          <div className="creation-section-head">
            <div>
              <div className="section-title">Delivery Companies &amp; Addresses</div>
              <div className="muted">
                Add as many as you have. Nothing is saved until you save the customer.
              </div>
            </div>
            <button type="button" className="btn secondary"
              onClick={() => setLocations((was) => [...was, { ...BLANK_LOCATION }])}>
              + Add address
            </button>
          </div>

          {locations.length === 0 ? (
            <Empty>
              No addresses yet. A customer can be saved without one, but no job can be
              created for them until they have at least one.
            </Empty>
          ) : null}

          {locations.map((site, index) => (
            <div className="container-entry" key={index}>
              <div className="header-row">
                <b>{site.label || `Address ${index + 1}`}</b>
                <button type="button" className="btn ghost"
                  onClick={() => setLocations((was) => was.filter((_, n) => n !== index))}>
                  Remove
                </button>
              </div>
              <LocationFields
                value={site} customerName={form.companyName}
                onChange={(next) => setLocations((was) =>
                  was.map((l, n) => (n === index
                    // One default per customer, held true while it is still a
                    // draft: two rows both ticked would otherwise both be sent
                    // and the last would quietly win.
                    ? next
                    : (next.isDefault ? { ...l, isDefault: false } : l))))}
              />
            </div>
          ))}
        </section>
      ) : null}

      <div className="action-row" style={{ marginTop: 12, gap: 8, justifyContent: "flex-end" }}>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save customer"}
        </button>
      </div>
    </form>
  );
}

/** §9 and §9.3. One customer: profile, its addresses, and what has changed. */
export function ZhtCustomerDetail({ code, onBack }) {
  const [tab, setTab] = useState("profile");
  const [state, setState] = useState({ loading: true, customer: null, locations: [] });
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  function load() {
    Promise.all([
      fetch(`/api/customers/${encodeURIComponent(code)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/customers/${encodeURIComponent(code)}/locations`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([c, l]) => setState({
      loading: false, customer: c?.customer ?? null, locations: l?.locations ?? [],
    })).catch(() => setState({ loading: false, customer: null, locations: [] }));
  }
  useEffect(load, [code]);

  async function saveLocation(method, body) {
    setError("");
    const response = await fetch(`/api/customers/${encodeURIComponent(code)}/locations`, {
      method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) { setError(payload?.error ?? "That address was not saved."); return false; }
    load();
    return true;
  }

  const c = state.customer;
  const sections = [
    { id: "profile", label: "Profile" },
    { id: "locations", label: "Delivery Companies & Addresses" },
    { id: "history", label: "Change History" },
  ];

  return (
    <Shell title={c?.companyName || code}
      action={<button className="btn secondary" type="button" onClick={onBack}>← Back</button>}>
      <div className="zht">
        <SectionNav sections={sections} current={tab} onJump={setTab} />
        {error ? <div className="callout" role="alert">{error}</div> : null}
        {note ? <div className="noa-note" role="status">{note}</div> : null}

        {tab === "profile" ? (
          <CustomerProfile
            customer={c} loading={state.loading}
            onSaved={(saved) => {
              setState((was) => ({ ...was, customer: saved }));
              setNote("Profile saved.");
            }}
            onError={setError}
          />
        ) : null}
        {tab === "profile" && c ? (
          <RemoveCustomer
            customer={c}
            // Back to the list, where the customer is simply no longer there.
            // onBack takes no argument: it is also the header's Back button.
            onDeleted={() => onBack()}
            onError={setError}
          />
        ) : null}

        {tab === "locations" ? (
          <CustomerLocations
            customerName={c?.companyName} locations={state.locations}
            loading={state.loading} onSave={saveLocation}
          />
        ) : null}

        {tab === "history" ? <CustomerHistory code={code} /> : null}
      </div>
    </Shell>
  );
}

/**
 * The customer's own details, editable.
 *
 * This was a read-only list of nine labelled values, which is why operations
 * reported that the profile tab cannot amend anything. Two of those nine are
 * gone: default consignee, which operations said is not required, and default
 * address, which is one of the addresses on the next tab and was a second
 * place to say the same thing.
 */
function CustomerProfile({ customer, loading, onSaved, onError }) {
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  if (loading) return <Empty>Loading…</Empty>;
  if (!customer) return <Empty>That customer could not be loaded.</Empty>;

  const form = {
    companyName: customer.companyName ?? "",
    shortName: customer.shortName ?? "",
    billingName: customer.billingName ?? "",
    defaultContact: customer.defaultContact ?? "",
    emailDomains: (customer.emailDomains ?? []).join(", "),
    accountStatus: customer.accountStatus ?? "ACTIVE",
    requiresPermit: Boolean(customer.requiresPermit),
    notes: customer.notes ?? "",
    ...edits,
  };

  const set = (key) => (event) => setEdits((was) => ({ ...was, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    onError("");
    const response = await fetch(`/api/customers/${encodeURIComponent(customer.code)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        companyName: form.companyName.trim(),
        shortName: form.shortName.trim() || null,
        billingName: form.billingName.trim() || null,
        defaultContact: form.defaultContact.trim() || null,
        emailDomains: form.emailDomains.split(/[,\s]+/).map((d) => d.trim()).filter(Boolean),
        accountStatus: form.accountStatus,
        requiresPermit: Boolean(form.requiresPermit),
        notes: form.notes.trim() || null,
      }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    setSaving(false);
    if (!response?.ok) { onError(payload?.error ?? "Those changes were not saved."); return; }
    // Cleared so the saved record becomes the truth again, rather than the
    // edits shadowing it and hiding a value the server normalised.
    setEdits({});
    onSaved(payload.customer);
  }

  return (
    <form className="creation-section" onSubmit={save}>
      <div className="creation-section-head">
        <div>
          <div className="section-title">Profile</div>
          <div className="muted">Every field here can be corrected. The code cannot.</div>
        </div>
      </div>
      <div className="job-create-grid formgrid">
        <label className="field">
          <span className="field-label">Code</span>
          {/* Shown, never editable: every job reference already printed for
              this customer is built from it. */}
          <input value={customer.code} readOnly disabled />
          <span className="field-helper">Issued once. Job numbers depend on it.</span>
        </label>
        <div className="field">
          <label htmlFor="cp-name">Company name<span className="req"> *</span></label>
          <input id="cp-name" required value={form.companyName} onChange={set("companyName")} />
        </div>
        <div className="field">
          <label htmlFor="cp-short">Short name</label>
          <input id="cp-short" value={form.shortName} onChange={set("shortName")} />
        </div>
        <div className="field">
          <label htmlFor="cp-billing">Billing name</label>
          <input id="cp-billing" value={form.billingName} onChange={set("billingName")} />
        </div>
        <div className="field">
          <label htmlFor="cp-contact">Contact</label>
          <input id="cp-contact" value={form.defaultContact} onChange={set("defaultContact")} />
        </div>
        <div className="field">
          <label htmlFor="cp-domains">Email domains</label>
          <input id="cp-domains" value={form.emailDomains} onChange={set("emailDomains")} />
          <span className="field-helper">How a notice is matched to this customer.</span>
        </div>
        <label className="field">
          <span className="field-label">Permits</span>
          <select
            value={form.requiresPermit ? "yes" : "no"}
            onChange={(event) => setEdits((was) => ({
              ...was, requiresPermit: event.target.value === "yes",
            }))}
          >
            <option value="no">Not normally required</option>
            <option value="yes">Normally required</option>
          </select>
          <span className="field-helper">
            The default for a new job. A job can still say otherwise.
          </span>
        </label>
        <div className="field">
          <label htmlFor="cp-status">Status</label>
          <select id="cp-status" value={form.accountStatus} onChange={set("accountStatus")}>
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On hold</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <div className="field full">
          <label htmlFor="cp-notes">Account notes</label>
          <textarea id="cp-notes" rows={3} value={form.notes} onChange={set("notes")} />
          <span className="field-helper">
            About the account. Instructions for a place go on its address.
          </span>
        </div>
      </div>
      <div className="action-row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

/**
 * Take a customer off the master.
 *
 * For the one entered twice, or entered and never traded with. The server
 * refuses once there are jobs, because every job number already printed is
 * built from the code, and it says so in a sentence rather than a status —
 * which is what gets shown here.
 *
 * Two steps and no typing. The people using this read the screen all shift and
 * are not helped by being asked to retype a code to prove they meant it; they
 * are helped by being told plainly what is about to go and being able to stop.
 * Nothing about it sits next to Save.
 */
function RemoveCustomer({ customer, onDeleted, onError }) {
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function remove() {
    setRemoving(true);
    onError("");
    const response = await fetch(`/api/customers/${encodeURIComponent(customer.code)}`, {
      method: "DELETE",
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    setRemoving(false);
    if (!response?.ok) {
      setAsking(false);
      onError(payload?.error ?? "That customer was not removed.");
      return;
    }
    onDeleted(customer);
  }

  return (
    <section className="creation-section" style={{ marginTop: 18 }}>
      <div className="creation-section-head">
        <div>
          <div className="section-title">Remove this customer</div>
          <div className="muted">
            Only possible while the customer has no jobs. Once it has, close the
            account above instead — that takes it off the lists and keeps the
            job numbers readable.
          </div>
        </div>
      </div>

      {asking ? (
        <div className="callout" role="alert">
          <div style={{ marginBottom: 10 }}>
            Remove <b>{customer.companyName}</b> and its saved addresses? This cannot be undone.
          </div>
          <div className="action-row" style={{ gap: 8 }}>
            <button className="btn danger" type="button" onClick={remove} disabled={removing}>
              {removing ? "Removing…" : `Yes, remove ${customer.code}`}
            </button>
            <button className="btn ghost" type="button" onClick={() => setAsking(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="action-row">
          <button className="btn danger" type="button" onClick={() => setAsking(true)}>
            Remove customer
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * The customer's addresses: add several, and correct any of them.
 *
 * Both were impossible. Adding was one-at-a-time behind a button that closed
 * itself on save, and a saved address could only be made default or taken out
 * of use — a wrong address had to be retired and retyped.
 */
function CustomerLocations({ customerName, locations, loading, onSave }) {
  const [drafts, setDrafts] = useState([]);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);

  async function saveAll() {
    setSaving(true);
    for (const site of drafts) {
      if (!site.label.trim() || !site.address.trim()) continue;
      await onSave("POST", site);
    }
    setDrafts([]);
    setSaving(false);
  }

  return (
    <section className="creation-section">
      <div className="creation-section-head">
        <div>
          <div className="section-title">Delivery Companies &amp; Addresses</div>
          <div className="muted">
            The places this customer&rsquo;s containers go. A job can only pick from here.
          </div>
        </div>
        <button type="button" className="btn secondary"
          onClick={() => setDrafts((was) => [...was, { ...BLANK_LOCATION }])}>
          + Add address
        </button>
      </div>

      {drafts.map((site, index) => (
        <div className="container-entry" key={`draft-${index}`}>
          <div className="header-row">
            <b>{site.label || `New address ${index + 1}`}</b>
            <button type="button" className="btn ghost"
              onClick={() => setDrafts((was) => was.filter((_, n) => n !== index))}>
              Remove
            </button>
          </div>
          <LocationFields
            value={site} customerName={customerName}
            onChange={(next) => setDrafts((was) => was.map((l, n) => (n === index ? next : l)))}
          />
        </div>
      ))}

      {drafts.length ? (
        <div className="action-row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn primary" onClick={saveAll} disabled={saving}>
            {saving ? "Saving…" : `Save ${drafts.length} address${drafts.length === 1 ? "" : "es"}`}
          </button>
        </div>
      ) : null}

      <div className="location-card-list" style={{ marginTop: drafts.length ? 16 : 0 }}>
        {locations.length ? locations.map((loc) => (
          <div className="location-card" key={loc.locationId}>
            {editing[loc.locationId] ? (
              <>
                <LocationFields
                  value={editing[loc.locationId]} customerName={customerName}
                  onChange={(next) => setEditing((was) => ({ ...was, [loc.locationId]: next }))}
                />
                <div className="action-row" style={{ marginTop: 8, gap: 8 }}>
                  <button type="button" className="btn primary" onClick={async () => {
                    const ok = await onSave("PATCH", {
                      locationId: loc.locationId, ...editing[loc.locationId],
                    });
                    if (ok) setEditing((was) => ({ ...was, [loc.locationId]: undefined }));
                  }}>
                    Save address
                  </button>
                  <button type="button" className="btn ghost"
                    onClick={() => setEditing((was) => ({ ...was, [loc.locationId]: undefined }))}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="location-card-top">
                  <b className="location-card-title">{loc.company}</b>
                  {loc.isDefault ? <span className="tag green">Default</span> : null}
                  {!loc.active ? <span className="tag gray">Out of use</span> : null}
                </div>
                <div>{loc.label}</div>
                <div className="muted">{loc.address}</div>
                {loc.operationalInstructions ? (
                  <div className="nc-job-address-preview" style={{ marginTop: 8 }}>
                    <b>Always here</b>
                    {loc.operationalInstructions}
                  </div>
                ) : null}
                <div className="muted" style={{ marginTop: 4 }}>
                  {loc.doubleMountingPermitted ? "Double mounting permitted" : "No double mounting"}
                  {loc.standbyUsual ? " · standby usual" : ""}
                </div>
                <div className="action-row" style={{ marginTop: 6, gap: 8 }}>
                  <button className="btn ghost" type="button"
                    onClick={() => setEditing((was) => ({
                      ...was,
                      [loc.locationId]: {
                        company: loc.company ?? "", label: loc.label ?? "",
                        address: loc.address ?? "",
                        operationalInstructions: loc.operationalInstructions ?? "",
                        isDefault: Boolean(loc.isDefault),
                        doubleMountingPermitted: loc.doubleMountingPermitted !== false,
                        standbyUsual: Boolean(loc.standbyUsual),
                      },
                    }))}>
                    Edit
                  </button>
                  {!loc.isDefault ? (
                    <button className="btn ghost" type="button"
                      onClick={() => onSave("PATCH", { locationId: loc.locationId, isDefault: true })}>
                      Make default
                    </button>
                  ) : null}
                  <button className="btn ghost" type="button"
                    onClick={() => onSave("PATCH", { locationId: loc.locationId, active: !loc.active })}>
                    {loc.active ? "Take out of use" : "Put back in use"}
                  </button>
                </div>
              </>
            )}
          </div>
        )) : (
          <Empty>
            {loading ? "Loading…" : "No addresses yet. A job cannot be created without one."}
          </Empty>
        )}
      </div>
    </section>
  );
}

/**
 * §13. What has changed about this customer, and who changed it.
 *
 * This tab existed and said the API did not publish the history. It does now,
 * keyed by the customer's code — which is also where creation files its own
 * event, having previously filed it under the lowercase id where nothing looks.
 */
function CustomerHistory({ code }) {
  const [state, setState] = useState({ loading: true, events: [] });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customers/${encodeURIComponent(code)}/history`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => { if (!cancelled) setState({ loading: false, events: d.events ?? [] }); })
      .catch(() => { if (!cancelled) setState({ loading: false, events: [] }); });
    return () => { cancelled = true; };
  }, [code]);

  const said = (event) => {
    if (event.event === "customer.created") return "Customer created";
    if (event.event === "location.added") return "Address added";
    if (event.event === "location.amended") return "Address changed";
    if (event.event === "customer.amended") return "Profile changed";
    return event.event;
  };

  return (
    <section className="creation-section">
      <div className="creation-section-head">
        <div>
          <div className="section-title">Change History</div>
          <div className="muted">Newest first.</div>
        </div>
      </div>
      {state.loading ? <Empty>Loading…</Empty> : null}
      {!state.loading && state.events.length === 0
        ? <Empty>Nothing has changed on this customer yet.</Empty> : null}
      {state.events.map((event, index) => (
        <div className="movement" key={`${event.createdAt}-${index}`}>
          <strong>{said(event)}</strong>
          {event.field ? <span className="muted"> · {event.field}</span> : null}
          <br />
          {event.previousValue || event.newValue ? (
            <span>
              {event.previousValue ? <s className="muted">{event.previousValue}</s> : null}
              {event.previousValue && event.newValue ? " → " : null}
              {event.newValue}
            </span>
          ) : null}
          <div className="muted" style={{ marginTop: 2 }}>
            {event.actor} · {formatWhen(event.createdAt)}
          </div>
        </div>
      ))}
    </section>
  );
}

/** A timestamp as somebody in Singapore reads one. */
function formatWhen(iso) {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return String(iso);
  return at.toLocaleString("en-SG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
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
