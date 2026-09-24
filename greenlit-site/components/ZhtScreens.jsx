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

  return (
    <Shell title="Planning Board">
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
          onSaved={() => { setAdding(false); load(); }} />
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
function AddCustomer({ onCancel, onSaved }) {
  const [form, setForm] = useState({ code: "", companyName: "", shortName: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setError("");
    const response = await fetch("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: form.code.trim().toUpperCase(),
        companyName: form.companyName.trim(),
        shortName: form.shortName.trim() || null,
      }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    setSaving(false);
    if (!response?.ok) { setError(payload?.error ?? "That customer was not saved."); return; }
    onSaved();
  }

  return (
    <form className="card" style={{ marginTop: 12 }} onSubmit={submit}>
      <div className="section-title">Add Customer</div>
      <div className="formgrid">
        <div className="field">
          <label htmlFor="zht-cust-code">Code</label>
          <input id="zht-cust-code" required value={form.code} onChange={set("code")}
            placeholder="ABC" maxLength={6} />
        </div>
        <div className="field">
          <label htmlFor="zht-cust-name">Company name</label>
          <input id="zht-cust-name" required value={form.companyName}
            onChange={set("companyName")} placeholder="ABC Pte Ltd" />
        </div>
        <div className="field">
          <label htmlFor="zht-cust-short">Short name</label>
          <input id="zht-cust-short" value={form.shortName} onChange={set("shortName")} />
        </div>
      </div>
      {error ? <div className="callout" style={{ marginTop: 8 }}>{error}</div> : null}
      <div className="action-row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save customer"}
        </button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** §9 and §9.3. One customer: profile, its locations, instructions, history. */
export function ZhtCustomerDetail({ code, onBack }) {
  const [tab, setTab] = useState("profile");
  const [state, setState] = useState({ loading: true, customer: null, locations: [] });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  function load() {
    Promise.all([
      fetch(`/api/customers/${encodeURIComponent(code)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/customers/${encodeURIComponent(code)}/locations`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([c, l]) => setState({
      loading: false, customer: c?.customer ?? null, locations: l?.locations ?? [],
    })).catch(() => setState({ loading: false, customer: null, locations: [] }));
  }
  useEffect(load, [code]);

  async function save(method, body) {
    setError("");
    const response = await fetch(`/api/customers/${encodeURIComponent(code)}/locations`, {
      method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) { setError(payload?.error ?? "That site was not saved."); return false; }
    load();
    return true;
  }

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
          <div className="header-row">
            <div className="section-title">Delivery Companies &amp; Addresses</div>
            <button className="btn secondary" type="button" onClick={() => setAdding(true)}>
              + Add Location
            </button>
          </div>
          {error ? <div className="callout">{error}</div> : null}

          {adding ? (
            <AddLocation onCancel={() => setAdding(false)}
              onSave={async (draft) => { if (await save("POST", draft)) setAdding(false); }} />
          ) : null}

          <div className="location-card-list">
            {state.locations.length ? state.locations.map((loc) => (
              <div className="location-card" key={loc.locationId}>
                <b>{loc.label}</b>
                {loc.isDefault ? <span className="tag green" style={{ marginLeft: 8 }}>Default</span> : null}
                {!loc.active ? <span className="tag gray" style={{ marginLeft: 8 }}>Out of use</span> : null}
                <br />{loc.address}
                <div className="muted" style={{ marginTop: 4 }}>
                  {loc.doubleMountingPermitted ? "Double mounting permitted" : "No double mounting"}
                  {loc.standbyUsual ? " · standby usual" : ""}
                </div>
                <div className="action-row" style={{ marginTop: 6, gap: 8 }}>
                  {!loc.isDefault ? (
                    <button className="btn ghost" type="button"
                      onClick={() => save("PATCH", { locationId: loc.locationId, isDefault: true })}>
                      Make default
                    </button>
                  ) : null}
                  <button className="btn ghost" type="button"
                    onClick={() => save("PATCH", { locationId: loc.locationId, active: !loc.active })}>
                    {loc.active ? "Take out of use" : "Put back in use"}
                  </button>
                </div>
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
          {/* §13. Customer-level audit is not published by the API yet, so this
              says so rather than showing an empty list that reads as "nothing
              has ever changed here". */}
          <Empty>Customer change history is not published by the API yet.</Empty>
        </div>
      ) : null}
    </Shell>
  );
}

/** §9.3. A delivery location. Double mounting defaults on; §57 gap 2.1-3. */
function AddLocation({ onCancel, onSave }) {
  const [form, setForm] = useState({
    label: "", address: "", isDefault: false,
    doubleMountingPermitted: true, standbyUsual: false,
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({
    ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
  }));

  return (
    <form className="card" style={{ marginTop: 10 }} onSubmit={async (event) => {
      event.preventDefault(); setSaving(true); await onSave(form); setSaving(false);
    }}>
      <div className="section-title">Add Location</div>
      <div className="formgrid">
        <div className="field">
          <label htmlFor="zht-loc-label">Company at this address</label>
          <input id="zht-loc-label" required value={form.label} onChange={set("label")} />
        </div>
        <div className="field">
          <label htmlFor="zht-loc-address">Address</label>
          <input id="zht-loc-address" required value={form.address} onChange={set("address")} />
        </div>
      </div>
      <div className="action-row" style={{ marginTop: 8, gap: 14, flexWrap: "wrap" }}>
        <label htmlFor="zht-loc-default">
          <input id="zht-loc-default" type="checkbox" checked={form.isDefault}
            onChange={set("isDefault")} /> Default for this customer
        </label>
        <label htmlFor="zht-loc-dm">
          <input id="zht-loc-dm" type="checkbox" checked={form.doubleMountingPermitted}
            onChange={set("doubleMountingPermitted")} /> Double mounting permitted
        </label>
        <label htmlFor="zht-loc-standby">
          <input id="zht-loc-standby" type="checkbox" checked={form.standbyUsual}
            onChange={set("standbyUsual")} /> Standby usual here
        </label>
      </div>
      <div className="action-row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save location"}
        </button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
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
