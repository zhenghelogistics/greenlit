/*
THESIS: A calm maritime operations console turns readiness facts into visible work without visual noise.
OWN-WORLD: Ink-navy structure, precise typography, quiet neutral surfaces, and status color used only when it carries meaning.
STORY: Controllers turn an arrival notice into reviewed job facts, open any operational fact as work, clear the blocker, and see the job, trip, container, chassis, queue, and activity history respond together.
FIRST VIEWPORT: A compact ink command bar, eight quiet operating indicators, then the urgency-ranked action register with responsibility shown in words.
FORM: Maritime operations console — restrained, data-led, and shift-ready. Signature interaction: every operable fact opens the same management drawer, and saving carries visible consequences across the shared job record.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
*/

import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import { jobFromApi } from "./lib/job-adapter.mjs";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FileCheck2,
  FileSearch,
  FileText,
  History,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  Plus,
  Save,
  ScanText,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
  X,
  Building2,
  UserRound,
  ClipboardList,
  CalendarRange,
  Container,
  Undo2,
  Receipt,
} from "lucide-react";
import { groupByCustomer, matchCustomer } from "@greenlit/engine";
import ZhtDashboard from "./components/ZhtDashboard.jsx";
import ZhtJobDetail from "./components/ZhtJobDetail.jsx";
import {
  ZhtJobs, ZhtPlanning, ZhtDrivers, ZhtChassis, ZhtBilling,
  ZhtEmptyReturns, ZhtSearchResults, ZhtCustomers, ZhtCustomerDetail,
} from "./components/ZhtScreens.jsx";
import { addIsoDays, REQUIRED_JOB_FIELDS } from "./lib/arrival-notice-parser.mjs";
import { validateContainerCount } from "@greenlit/engine";
import { reconcileExtraction, toExtractedFields } from "@greenlit/engine";

/**
 * §12 critical fields, in the arrival-notice parser's vocabulary.
 *
 * The engine's CRITICAL_FIELDS list uses the domain names (blNumber,
 * deliveryAddress); the parser emits its own (billOfLading, consignee).
 * reconcileExtraction takes the list as an option for exactly this reason,
 * rather than either side renaming to match the other.
 */
const INTAKE_CRITICAL_FIELDS = [
  "containerNumber", "billOfLading", "eta", "carrier", "terminal",
  "portOfDischarge", "consignee", "vessel", "demurrageFreeDays",
  "detentionFreeDays",
];
import { applyFreeTime, applyTripUpdate, assignChassis, nextTripReference, releaseChassis } from "./lib/operations-actions.mjs";
import { companyNameFromConsignee, suggestCode } from "./lib/company-from-document.mjs";
import { toIntakeResult } from "./lib/intake-fields.mjs";

// -----------------------------------------------------------------------------
// Seed data — fixed at 19 August 2026 so the demo is repeatable.
// -----------------------------------------------------------------------------

/**
 * Operational today, in the local timezone (§14.5 displays Asia/Singapore).
 *
 * This was a frozen constant while the screens ran on seed fixtures, which
 * meant nothing aged, nothing became overdue and no deadline ever arrived.
 * The engine computes against real time, so the interface must too.
 */
function operationalToday() {
  return new Date().toISOString().slice(0, 10);
}
/**
 * The acting user.
 *
 * Held in a module-level variable rather than context so the existing handlers
 * can read it without threading a prop through every screen. §7 roles are
 * enforced server-side against the user directory, so choosing a user here
 * grants nothing — the server still refuses anything that user may not do.
 * What is missing is proof that the person at the keyboard IS this user, which
 * is exactly what authentication adds.
 */
/**
 * Who is acting.
 *
 * A picker used to sit in the header offering every name in the directory,
 * which meant anyone at the keyboard could act as an administrator. §7 roles
 * are enforced server-side, so it granted no permission the chosen user did
 * not have — but it let one person put another's name on an audit entry, and
 * §13 exists precisely so that a change can be traced to a person. A choice of
 * identity is not an identity.
 *
 * It is a single fixed operator until sign-in exists. That is still not proof
 * of who is at the keyboard, but it no longer invites the impersonation, and
 * it makes the gap obvious rather than dressing it up as a feature.
 */
/**
 * §7. Who is acting is no longer decided here.
 *
 * This was a constant, and before that a dropdown. Both were the same mistake
 * in different clothes: the browser deciding who somebody is. The server takes
 * the actor from a verified session and the screen asks it who that is, so the
 * name on screen and the name on the audit trail cannot disagree.
 */

/** Shown, not chosen: the name that will appear on this session's audit trail. */
/**
 * When the board last reached the server.
 *
 * Quiet by design: it is reassurance, not information, and it earns its place
 * only because the Reload button it replaced was doing that job badly. It goes
 * loud in one case — the server could not be reached — because then what is on
 * screen is genuinely out of date and nothing else says so.
 */
function LastUpdated({ at, stale }) {
  // The label is relative to now, and now is not a prop. It is computed in an
  // effect rather than during render, because a render may happen at any time
  // and must produce the same output for the same inputs.
  const [label, setLabel] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!at) { setLabel(""); return undefined; }
    // The clock is the external system being synchronised from, which is what
    // an effect is for; the first call is what puts a label on screen at all.
    const describe = () => {
      const seconds = Math.round((Date.now() - at) / 1000);
      setLabel(seconds < 75 ? "Updated just now" : `Updated ${Math.round(seconds / 60)} min ago`);
    };
    describe();
    const timer = window.setInterval(describe, 30_000);
    return () => window.clearInterval(timer);
  }, [at]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (stale) {
    return (
      <span role="status" className="inline-flex items-center gap-2 rounded-md bg-white/15 px-3 py-1.5 text-[15px] font-medium text-white">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        Not updating
      </span>
    );
  }
  if (!label) return null;
  return <span role="status" className="hidden whitespace-nowrap text-[15px] text-white/90 sm:inline">{label}</span>;
}

/**
 * §7.1. The directory, and who may change it.
 *
 * An administrator adds people and sets what each of them may do. Nobody sets
 * their own: signing in proves who you are, and what that means is written by
 * somebody else. A person who can choose their own role has no role.
 *
 * Everyone else sees the list read-only, because knowing who covers which
 * shift is ordinary and useful, while addresses and who is switched off are
 * not.
 */
const ROLE_LABELS = {
  OPERATIONS: "Operations",
  MANAGEMENT: "Management",
  ADMINISTRATOR: "Administrator",
};

const ROLE_MEANS = {
  OPERATIONS: "Runs jobs start to finish — create, amend, complete.",
  MANAGEMENT: "Everything operations does, plus reopening a completed job.",
  ADMINISTRATOR: "All of that, plus companies, users and settings.",
};

function People() {
  const [state, setState] = useState({ status: "loading", users: [], canManage: false });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = React.useCallback(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setState({ status: "ready", users: d.users ?? [], canManage: Boolean(d.canManage) }))
      .catch(() => setState({ status: "error", users: [], canManage: false }));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function change(userId, patch) {
    setError("");
    const user = state.users.find((u) => u.userId === userId);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...user, ...patch }),
    }).catch(() => null);

    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) { setError(payload?.error ?? "Could not save that change."); return; }
    load();
  }

  async function remove(user) {
    // A removal that cannot be undone deserves the person's name in the
    // question, not "are you sure".
    if (!window.confirm(
      `Remove ${user.displayName} from the directory?\n\n`
      + `They will no longer be able to sign in. Anything they already did `
      + `still shows their name in the job history.`
    )) return;

    setError("");
    const response = await fetch("/api/users", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.userId }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) { setError(payload?.error ?? "Could not remove that person."); return; }
    load();
  }

  async function setActive(userId, active) {
    setError("");
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, active }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) { setError(payload?.error ?? "Could not change that account."); return; }
    load();
  }

  return (
    <main id="main-content" className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="gl-display">People</h1>
          <p className="gl-body-plain mt-1 text-[color:var(--gl-ink-muted)]">
            {state.canManage
              ? "Who can sign in, and what each of them may do."
              : "Who covers which shift. Only an administrator can change this."}
          </p>
        </div>
        {state.canManage && !adding ? (
          <button type="button" onClick={() => setAdding(true)}
            className="min-h-12 rounded-md border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-semibold text-white hover:bg-[color:var(--gl-accent-hover)]">
            Add someone
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="gl-body-plain mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
          {error}
        </p>
      ) : null}

      {adding ? <AddPerson onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} /> : null}

      <section className="gl-panel mt-5 overflow-hidden">
        <table className="gl-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Signs in with</th>
              <th>Role</th>
              {state.canManage ? <th>Account</th> : null}
            </tr>
          </thead>
          <tbody>
            {state.users.map((user) => (
              <tr key={user.userId} style={user.active === false ? { opacity: 0.55 } : undefined}>
                <td>
                  <div className="gl-body" style={{ fontWeight: 500 }}>{user.displayName}</div>
                  <div className="gl-caption">{user.userId}</div>
                </td>
                <td className="gl-body gl-muted">{user.email || "No account yet"}</td>
                <td>
                  {state.canManage ? (
                    <label>
                      <span className="sr-only">Role for {user.displayName}</span>
                      <select
                        value={user.role}
                        onChange={(event) => change(user.userId, { role: event.target.value })}
                        className="min-h-11 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-2 text-[17px] text-[color:var(--gl-ink)]"
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="gl-body">{ROLE_LABELS[user.role] ?? user.role}</span>
                  )}
                  <div className="gl-caption mt-1 max-w-[42ch]">{ROLE_MEANS[user.role]}</div>
                </td>
                {state.canManage ? (
                  <td>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setActive(user.userId, user.active === false)}
                        className="min-h-11 cursor-pointer rounded-md px-2 text-[15px] font-semibold text-[color:var(--gl-accent)] underline underline-offset-4"
                      >
                        {user.active === false ? "Switch on" : "Switch off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(user)}
                        className="min-h-11 cursor-pointer rounded-md px-2 text-[15px] font-semibold text-[color:var(--gl-state-blocked-ink)] underline underline-offset-4"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {state.status === "ready" && !state.users.length ? (
          <p className="gl-body p-6">Nobody in the directory yet.</p>
        ) : null}
      </section>

      {state.canManage ? (
        <p className="gl-caption mt-5 max-w-[70ch]">
          People create their own accounts at the sign-in screen and arrive as
          Operations; this is where you raise them. Switch someone off when they
          have left but their jobs are still being closed out — they keep their
          place in the list. Remove is for a row that should not exist at all.
          Either way the job history still names them: §13 stores the name
          itself, not a link to this list.
        </p>
      ) : null}
    </main>
  );
}

/** Adding a person. The role is chosen here, by an administrator, once. */
function AddPerson({ onDone, onCancel }) {
  const [form, setForm] = useState({ displayName: "", email: "", userId: "", role: "OPERATIONS" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    setSaving(false);
    if (!response?.ok) { setError(payload?.error ?? "Could not add that person."); return; }
    onDone();
  }

  return (
    <form onSubmit={submit} className="gl-panel mt-5 p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="gl-label">Name</span>
          <input required value={form.displayName} onChange={set("displayName")}
            placeholder="Winnie Ong"
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px]" />
          <span className="gl-caption">Goes on every change they make.</span>
        </label>

        <label className="grid gap-2">
          <span className="gl-label">Email</span>
          <input type="email" value={form.email} onChange={set("email")}
            placeholder="winnie@zhenghe.com.sg"
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px]" />
          <span className="gl-caption">What they sign in with. Must match their Supabase account.</span>
        </label>

        <label className="grid gap-2">
          <span className="gl-label">Username</span>
          <input required value={form.userId} onChange={set("userId")}
            placeholder="winnie" pattern="[a-z0-9][a-z0-9._-]{1,30}"
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px]" />
          <span className="gl-caption">Short, lower-case. Cannot be changed later.</span>
        </label>

        <label className="grid gap-2">
          <span className="gl-label">Role</span>
          <select value={form.role} onChange={set("role")}
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px]">
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <span className="gl-caption">{ROLE_MEANS[form.role]}</span>
        </label>
      </div>

      {error ? (
        <p role="alert" className="gl-body-plain mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={saving}
          className="min-h-12 rounded-md border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-semibold text-white disabled:opacity-60">
          {saving ? "Adding…" : "Add to the directory"}
        </button>
        <button type="button" onClick={onCancel}
          className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-5 text-[17px] text-[color:var(--gl-ink)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * §24. The permits on a shipment.
 *
 * A permit belongs to the job, not to a container, and this panel is where
 * that shows: one list at job level, each entry saying which containers it
 * covers. Copying a permit against every container would make several records
 * that can disagree, and the same permit routinely covers several boxes.
 *
 * Every verdict here was computed by the server against the job as it stands
 * right now. Nothing is stored, so amending a voyage turns its permits amber
 * on the next load without anyone touching them.
 */
const PERMIT_TONE = {
  VALID: "border-emerald-200 bg-emerald-50 text-emerald-800",
  ATTENTION: "border-rose-200 bg-rose-50 text-[color:var(--gl-state-blocked-ink)]",
  REVIEW: "border-slate-300 bg-slate-100 text-slate-700",
};
const PERMIT_WORD = { VALID: "Checks out", ATTENTION: "Needs attention", REVIEW: "Not checked yet" };

function PermitPanel({ jobId, containers, onChanged }) {
  const [state, setState] = useState({ status: "loading", permits: [], uncovered: [] });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [allocating, setAllocating] = useState(null);

  const load = React.useCallback(() => {
    if (!jobId) return;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/permits`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setState({
        status: "ready",
        permits: d.permits ?? [],
        uncovered: d.uncoveredContainers ?? [],
      }))
      .catch(() => setState({ status: "error", permits: [], uncovered: [] }));
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function send(path, method, body) {
    setError("");
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) { setError(payload?.error ?? "That did not save."); return null; }
    load();
    onChanged?.();
    return payload;
  }

  const label = (cid) =>
    containers.find((c) => c.id === cid)?.number || cid;

  return (
    <Panel
      title="Permits"
      className="mt-7"
      action={!adding ? (
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold text-[var(--gl-accent)] underline underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600">
          <FileSearch className="h-5 w-5" aria-hidden="true" />Add a permit
        </button>
      ) : null}
    >
      {/* Panel renders its children bare — every other caller supplies its own
          padding, and this one did not, so the whole panel sat flush against
          the border. */}
      <div className="p-6">
      {error ? (
        <p role="alert" className="gl-body-plain mb-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
          {error}
        </p>
      ) : null}

      {adding ? (
        <AddPermit
          onCancel={() => setAdding(false)}
          onSave={async (draft) => {
            const r = await send(`/api/jobs/${encodeURIComponent(jobId)}/permits`, "POST", draft);
            if (r) { setAdding(false); if (r.warning) setError(r.warning); }
          }}
        />
      ) : null}

      {state.permits.length === 0 && !adding ? (
        <p className="gl-body">
          No permit recorded yet. The job can still be worked: Portnet release
          is what holds a collection, not the permit. The permit is needed
          before the delivery order is exchanged.
        </p>
      ) : null}

      <div className="grid gap-4">
        {state.permits.map((permit) => (
          <article key={permit.permitId} className="rounded-lg border border-[color:var(--gl-line)] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="gl-figures text-[19px] font-semibold text-[color:var(--gl-ink)]">
                  {permit.permitNumber || "Number not entered"}
                </div>
                <div className="gl-caption mt-1">
                  {permit.fileName || "No file attached"}
                  {permit.expiryDate ? ` · expires ${formatDay(permit.expiryDate)}` : ""}
                </div>
              </div>
              <span className={`inline-flex min-h-7 items-center rounded-full border px-2 text-[15px] font-semibold ${PERMIT_TONE[permit.verdict.overall]}`}>
                {PERMIT_WORD[permit.verdict.overall]}
              </span>
            </div>

            {/* Every issue in the controller's words, not a status code. A
                permit that needs attention is worth a sentence saying which
                sailing it covers and which one this job is on. */}
            {permit.verdict.issues.length ? (
              <ul className="mt-3 grid gap-2">
                {permit.verdict.issues.map((issue) => (
                  <li key={issue} className="gl-body-plain rounded-md border border-rose-200 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
                    {issue}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="gl-body-plain text-[color:var(--gl-ink-muted)]">
                {permit.linkedContainerIds.length
                  ? `Covers ${permit.linkedContainerIds.map(label).join(", ")}`
                  : "Not yet applied to any container"}
              </span>
              <button type="button"
                onClick={() => setAllocating(allocating === permit.permitId ? null : permit.permitId)}
                className="min-h-11 cursor-pointer px-1 text-[15px] font-semibold text-[var(--gl-accent)] underline underline-offset-4">
                Choose containers
              </button>
              <button type="button"
                onClick={() => send(`/api/jobs/${encodeURIComponent(jobId)}/permits/${permit.permitId}`, "PUT",
                  { containerIds: containers.map((c) => c.id) })}
                className="min-h-11 cursor-pointer px-1 text-[15px] font-semibold text-[var(--gl-accent)] underline underline-offset-4">
                Apply to all {containers.length}
              </button>
              <button type="button"
                onClick={() => {
                  if (window.confirm(`Remove permit ${permit.permitNumber || ""}? The containers it covers stay as they are.`)) {
                    send(`/api/jobs/${encodeURIComponent(jobId)}/permits/${permit.permitId}`, "DELETE");
                  }
                }}
                className="min-h-11 cursor-pointer px-1 text-[15px] font-semibold text-[color:var(--gl-state-blocked-ink)] underline underline-offset-4">
                Remove
              </button>
            </div>

            {allocating === permit.permitId ? (
              <ContainerAllocation
                containers={containers}
                selected={permit.linkedContainerIds}
                onCancel={() => setAllocating(null)}
                onApply={async (ids) => {
                  await send(`/api/jobs/${encodeURIComponent(jobId)}/permits/${permit.permitId}`,
                    "PUT", { containerIds: ids });
                  setAllocating(null);
                }}
              />
            ) : null}
          </article>
        ))}
      </div>

      {state.uncovered.length > 0 && state.permits.length > 0 ? (
        <p className="gl-body-plain mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
          No permit covers {state.uncovered.map(label).join(", ")}.
        </p>
      ) : null}
      </div>
    </Panel>
  );
}

/**
 * Choosing which containers a permit covers.
 *
 * The tick list is the whole relationship, not an addition to it: applying
 * replaces what the permit covered before, so unticking a container genuinely
 * uncovers it. Saying so under the buttons, because "apply" could mean either.
 */
function ContainerAllocation({ containers, selected, onCancel, onApply }) {
  const [ticked, setTicked] = useState(() => new Set(selected));

  const toggle = (id) => setTicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="mt-4 rounded-lg border border-[color:var(--gl-line-strong)] bg-[color:var(--gl-bg)] p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {containers.map((c) => (
          <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md bg-white px-3">
            <input type="checkbox" checked={ticked.has(c.id)} onChange={() => toggle(c.id)}
              className="h-5 w-5 cursor-pointer accent-[color:var(--gl-accent)]" />
            <span className="gl-figures text-[color:var(--gl-ink)]">{c.number || c.id}</span>
            <span className="gl-caption">{c.type || ""}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => onApply([...ticked])}
          className="min-h-12 rounded-md border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-semibold text-white">
          Apply to {ticked.size} {ticked.size === 1 ? "container" : "containers"}
        </button>
        <button type="button" onClick={onCancel}
          className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-5 text-[17px] text-[color:var(--gl-ink)]">
          Cancel
        </button>
      </div>
      <p className="gl-caption mt-3">
        This replaces what the permit covers. Anything unticked stops being covered.
      </p>
    </div>
  );
}

/** Recording a permit. The vessel is asked for because it is what gets checked. */
function AddPermit({ onCancel, onSave }) {
  const [form, setForm] = useState({
    permitNumber: "", expiryDate: "", permitVesselVoyage: "", fileName: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = "min-h-12 w-full rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px] text-[color:var(--gl-ink)]";

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        await onSave(form);
        setSaving(false);
      }}
      className="mb-5 rounded-lg border border-[color:var(--gl-line-strong)] bg-[color:var(--gl-bg)] p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="gl-label">Permit number</span>
          <input value={form.permitNumber} onChange={set("permitNumber")}
            placeholder="IG6I728642H" className={field} />
          <span className="gl-caption">Two letters, a digit, a letter, six digits, a letter.</span>
        </label>
        <label className="grid gap-2">
          <span className="gl-label">Expiry date</span>
          <input type="date" value={form.expiryDate} onChange={set("expiryDate")} className={field} />
          <span className="gl-caption">Must outlast the vessel&rsquo;s arrival, not merely reach it.</span>
        </label>
        <label className="grid gap-2">
          <span className="gl-label">Vessel and voyage on the permit</span>
          <input value={form.permitVesselVoyage} onChange={set("permitVesselVoyage")}
            placeholder="CALLAO BRIDGE / 256S" className={field} />
          <span className="gl-caption">Checked against the job, so a changed voyage shows up.</span>
        </label>
        <label className="grid gap-2">
          <span className="gl-label">File name</span>
          <input value={form.fileName} onChange={set("fileName")}
            placeholder="permit.pdf" className={field} />
          <span className="gl-caption">Held once here, not copied to each container.</span>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={saving}
          className="min-h-12 rounded-md border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving…" : "Record permit"}
        </button>
        <button type="button" onClick={onCancel}
          className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-5 text-[17px] text-[color:var(--gl-ink)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * §33. Finishing a job, and opening a finished one again.
 *
 * The engine answers whether it may be closed; a person decides whether it is.
 * So this asks for the outstanding list first and shows all of it — somebody
 * about to close a job wants to know everything left, not to discover it one
 * refusal at a time.
 */
function ClosurePanel({ jobId, onChanged }) {
  const [state, setState] = useState({ status: "loading", blockers: [], canClose: false, closed: false });
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  // Takes the id rather than the job, like the panels beside it: an optional
  // chain in a dependency list is a dependency the compiler cannot track.
  const load = React.useCallback(() => {
    if (!jobId) return;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/closure`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setState({ status: "ready", ...d }))
      .catch(() => setState({ status: "error", blockers: [], canClose: false, closed: false }));
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function send(method, body) {
    setError("");
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/closure`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);

    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      // A 409 carries the outstanding list; showing it beats "could not close".
      setError([payload?.error, ...(payload?.blockers ?? [])].filter(Boolean).join(" "));
      return false;
    }
    load();
    onChanged?.();
    return true;
  }

  if (state.status !== "ready") return null;

  return (
    <Panel title={state.closed ? "This job is closed" : "Finishing this job"} className="mt-7">
      <div className="p-6">
        {error ? (
          <p role="alert" className="gl-body-plain mb-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
            {error}
          </p>
        ) : null}

        {state.closed ? (
          <>
            <p className="gl-body">
              Closed, so it is billable. Reopening changes what has already been
              invoiced, which is why it is management&rsquo;s to do and why it
              needs a reason.
            </p>
            {reopening ? (
              <div className="mt-5 grid gap-3">
                <label className="grid gap-2">
                  <span className="gl-label">Why is this being reopened?</span>
                  <textarea
                    rows={3} value={reason} onChange={(event) => setReason(event.target.value)}
                    placeholder="Detention was billed at 4 days, carrier says 6"
                    className="w-full rounded-md border border-[color:var(--gl-line-strong)] bg-white p-3 text-[17px] text-[color:var(--gl-ink)]"
                  />
                  <span className="gl-caption">
                    This is the only record of why the invoice moved.
                  </span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button type="button"
                    onClick={async () => { if (await send("DELETE", { reason })) { setReopening(false); setReason(""); } }}
                    className="min-h-12 rounded-md border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-semibold text-white">
                    Reopen this job
                  </button>
                  <button type="button" onClick={() => { setReopening(false); setError(""); }}
                    className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-5 text-[17px] text-[color:var(--gl-ink)]">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setReopening(true)}
                className="mt-5 min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-5 text-[17px] font-semibold text-[color:var(--gl-ink)]">
                Reopen
              </button>
            )}
          </>
        ) : state.canClose ? (
          <>
            <p className="gl-body">
              Everything is finished: the containers are back, the trips are done
              and nothing is outstanding.
            </p>
            <button type="button" onClick={() => send("POST")}
              className="mt-5 min-h-12 rounded-md border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-semibold text-white hover:bg-[color:var(--gl-accent-hover)]">
              Close this job
            </button>
          </>
        ) : (
          <>
            <p className="gl-body">Still outstanding:</p>
            <ul className="mt-3 grid gap-2">
              {state.blockers.map((blocker) => (
                <li key={blocker} className="gl-body-plain rounded-md border border-[color:var(--gl-line)] bg-[color:var(--gl-bg)] p-3 text-[color:var(--gl-ink)]">
                  {blocker}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}

/**
 * §10. The documents filed against a job.
 *
 * Extraction records which page and which line every value came from; this is
 * where the page and the line can actually be checked. Opening one mints a
 * short-lived link rather than holding a permanent URL: the bucket is private
 * because these are customers' commercial papers.
 */
const DOCUMENT_LABEL = {
  ARRIVAL_NOTICE: "Arrival notice",
  BILL_OF_LADING: "Bill of lading",
  HOUSE_BILL_OF_LADING: "House bill of lading",
  PERMIT: "Permit",
  DELIVERY_ORDER: "Delivery order",
  BOOKING_CONFIRMATION: "Booking confirmation",
  EXPORT_CLEARANCE: "Export clearance",
  PORTNET_RELEASE: "Portnet release",
  EMPTY_RETURN_CONFIRMATION: "Empty return confirmation",
  COMMERCIAL_INVOICE: "Commercial invoice",
  PACKING_LIST: "Packing list",
  VGM: "VGM",
  OTHER: "Other",
};

function DocumentsPanel({ jobId }) {
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(() => {
    if (!jobId) return;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/documents`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setDocuments(d.documents ?? []))
      .catch(() => setDocuments([]));
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function open(documentId) {
    setError("");
    const response = await fetch(
      `/api/jobs/${encodeURIComponent(jobId)}/documents/${encodeURIComponent(documentId)}`,
    ).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok || !payload?.url) {
      setError(payload?.error ?? "That document could not be opened.");
      return;
    }
    window.open(payload.url, "_blank", "noopener");
  }

  async function attach(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(
      `/api/jobs/${encodeURIComponent(jobId)}/documents`, { method: "POST", body },
    ).catch(() => null);
    const payload = await response?.json().catch(() => ({}));
    setBusy(false);
    if (!response?.ok) { setError(payload?.error ?? "That file was not filed."); return; }
    load();
  }

  if (documents === null) return null;

  // Superseded versions are kept — the job was worked off the original — but
  // they are not what someone is looking for, so they sit under the current one.
  const current = documents.filter((d) => d.isCurrentVersion);
  const superseded = documents.filter((d) => !d.isCurrentVersion);

  return (
    <Panel
      title="Documents"
      className="mt-7"
      action={
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-2 font-semibold text-[var(--gl-accent)] underline underline-offset-4">
          <FileSearch className="h-5 w-5" aria-hidden="true" />
          {busy ? "Filing…" : "Attach a file"}
          <input type="file" className="hidden" disabled={busy}
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => { attach(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      }
    >
      <div className="p-6">
        {error ? (
          <p role="alert" className="gl-body-plain mb-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
            {error}
          </p>
        ) : null}

        {current.length === 0 ? (
          <p className="gl-body">
            Nothing filed yet. An arrival notice applied through Document Intake
            is filed here automatically.
          </p>
        ) : (
          <ul className="grid gap-3">
            {current.map((document) => (
              <li key={document.documentId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--gl-line)] bg-white p-4">
                <div className="min-w-0">
                  <div className="gl-body" style={{ fontWeight: 500 }}>{document.filename}</div>
                  <div className="gl-caption mt-1">
                    {DOCUMENT_LABEL[document.documentType] ?? document.documentType}
                    {" · "}{formatDay(document.receivedAt)}
                    {document.version > 1 ? ` · version ${document.version}` : ""}
                  </div>
                </div>
                <button type="button" onClick={() => open(document.documentId)}
                  className="min-h-11 cursor-pointer rounded-md px-2 text-[15px] font-semibold text-[color:var(--gl-accent)] underline underline-offset-4">
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}

        {superseded.length > 0 ? (
          <p className="gl-caption mt-4">
            {superseded.length} earlier {superseded.length === 1 ? "version is" : "versions are"} kept.
            The job was worked from {superseded.length === 1 ? "it" : "them"}, so {superseded.length === 1 ? "it stays" : "they stay"} on the record.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

/**
 * §9. Twenty notices, grouped by the company they belong to.
 *
 * The question here is not "is this field right" — that is the single-document
 * review, and asking it twenty times in a row is how a batch becomes slower
 * than one at a time. The question is "do these belong where I think they do",
 * which is answered by looking at four groups rather than twenty rows.
 *
 * A document whose consignee matches no customer is not a failure: it is a
 * company that has not been set up. It groups under that name so the operator
 * creates the company once and every notice for it follows.
 */
function BatchReview({ batch, customers, onApplyAll, onDiscard, applying }) {
  const read = batch.filter((b) => b.state === "read");
  const failed = batch.filter((b) => b.state === "failed");
  const reading = batch.filter((b) => b.state === "reading");

  const grouped = groupByCustomer(
    read,
    (b) => String(b.result?.values?.consignee ?? ""),
    customers,
  );

  return (
    <main id="main-content" className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="gl-display">{batch.length} documents</h1>
      <p className="gl-body-plain mt-1 text-[color:var(--gl-ink-muted)]">
        {reading.length > 0
          ? `Reading ${reading.length} of ${batch.length}. They go ${DOCUMENTS_PER_REQUEST} at a time and are read together, `
            + "so a batch takes about as long as its slowest document rather than the sum of them."
          : "Grouped by the company each names as consignee."}
      </p>

      {reading.length > 0 ? (
        <Panel title="Reading" className="mt-7">
          <div className="p-6">
            <ul className="grid gap-2">
              {batch.map((item) => (
                <li key={item.fileName} className="flex items-center justify-between gap-3">
                  <span className="gl-body-plain text-[color:var(--gl-ink)]">{item.fileName}</span>
                  <span className="gl-caption">
                    {item.state === "reading" ? "reading…" : item.state === "failed" ? "could not read" : "read"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      ) : null}

      {grouped.matched.map((group) => (
        <Panel
          key={group.customer.code}
          title={`${group.customer.companyName} · ${group.documents.length}`}
          className="mt-7"
        >
          <div className="p-6">
            {/* How the match was made, because "matched on the company name"
                and "matched on an email domain" deserve different amounts of
                trust when twenty are confirmed at once. */}
            <p className="gl-caption mb-3">
              {group.matchedOn === "name" ? "Matched on the company name."
                : group.matchedOn === "shortName" ? "Matched on the short name."
                : "Matched on an email domain — worth a second look."}
            </p>
            <ul className="grid gap-2">
              {group.documents.map((item) => (
                <li key={item.fileName} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[color:var(--gl-line)] bg-white p-3">
                  <span className="gl-body-plain text-[color:var(--gl-ink)]">{item.fileName}</span>
                  <span className="gl-caption">
                    {item.result?.values?.billOfLading || "no B/L read"}
                    {" · "}
                    {(item.result?.containers ?? []).length} container(s)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      ))}

      {grouped.unmatched.map((group) => (
        <Panel key={group.named} title={`${group.named} · ${group.documents.length}`} className="mt-7">
          <div className="p-6">
            <p className="gl-body-plain rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              No company matches this consignee yet. Create it once on the
              Companies page and every notice here will attach to it.
            </p>
            <ul className="mt-3 grid gap-2">
              {group.documents.map((item) => (
                <li key={item.fileName} className="gl-body-plain text-[color:var(--gl-ink)]">{item.fileName}</li>
              ))}
            </ul>
          </div>
        </Panel>
      ))}

      {failed.length > 0 || grouped.unnamed.length > 0 ? (
        <Panel title="Needs a look" className="mt-7">
          <div className="p-6">
            <ul className="grid gap-2">
              {failed.map((item) => (
                <li key={item.fileName} className="gl-body-plain rounded-md border border-rose-200 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
                  <strong>{item.fileName}</strong> — {item.error}
                </li>
              ))}
              {grouped.unnamed.map((item) => (
                <li key={item.fileName} className="gl-body-plain rounded-md border border-[color:var(--gl-line)] bg-white p-3 text-[color:var(--gl-ink)]">
                  <strong>{item.fileName}</strong> — names no consignee, so there is nothing to match a company against.
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      ) : null}

      {reading.length === 0 ? (
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={applying || grouped.matched.length === 0}
            onClick={() => onApplyAll(grouped.matched)}
            className="min-h-12 rounded-md border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-semibold text-white disabled:opacity-60"
          >
            {applying
              ? "Creating jobs…"
              : `Create ${grouped.matched.reduce((n, g) => n + g.documents.length, 0)} jobs`}
          </button>
          <button type="button" onClick={onDiscard}
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-5 text-[17px] text-[color:var(--gl-ink)]">
            Discard
          </button>
          {grouped.unmatched.length > 0 ? (
            <span className="gl-caption">
              {grouped.unmatched.reduce((n, g) => n + g.documents.length, 0)} document(s) waiting on a company.
            </span>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function ActingUser() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not signed in"))))
      .then((d) => { if (!cancelled) setUser(d.principal ?? null); })
      .catch(() => { if (!cancelled) setUser(null); });
    return () => { cancelled = true; };
  }, []);

  if (!user) return null;

  const role = user.role === "ADMINISTRATOR" ? "Admin"
    : user.role === "MANAGEMENT" ? "Manager" : "Controller";

  return (
    <div className="flex shrink-0 items-center gap-2 text-[15px] text-white/90">
      <UserRound className="h-5 w-5 shrink-0 text-white/90" aria-hidden="true" />
      <span>
        <span className="sr-only">Signed in as </span>
        {user.displayName} &middot; {role}
      </span>
      <form action="/api/sign-out" method="post" className="ml-1">
        <button
          type="submit"
          className="min-h-11 cursor-pointer rounded-md px-2 text-[15px] text-white/90 underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

const CARPARK = "ZHL Carpark, Pioneer Road";

/**
 * Which fields block applying.
 *
 * Derived from REQUIRED_JOB_FIELDS rather than marked by hand on each field:
 * the badge saying a field is needed and the button refusing to apply have to
 * be answering the same question, and two lists kept in step by hand are two
 * lists that eventually disagree.
 */
const isRequiredField = (key) => REQUIRED_JOB_FIELDS.includes(key);

const DOCUMENT_FIELD_GROUPS = [
  {
    title: "Shipment",
    fields: [
      { key: "eta", label: "Estimated arrival", type: "date" },
      { key: "billOfLading", label: "Bill of lading" },
      // Present only when a forwarder is involved, so optional by nature
      // rather than by omission — most direct carrier documents carry none.
      { key: "houseBillOfLading", label: "House bill of lading" },
      { key: "bookingNumber", label: "Booking number" },
      { key: "vessel", label: "Main vessel" },
      { key: "voyage", label: "Voyage" },
      { key: "portOfLoading", label: "Port of loading" },
      { key: "portOfDischarge", label: "Port of discharge" },
      { key: "terminal", label: "Discharging terminal" },
    ],
  },
  {
    title: "Parties and delivery",
    fields: [
      { key: "shipper", label: "Shipper", multiline: true },
      { key: "consignee", label: "Consignee", multiline: true },
      { key: "notify", label: "Notify party", multiline: true },
      { key: "deliveryAddress", label: "Delivery address", multiline: true },
      { key: "reference", label: "Carrier reference" },
    ],
  },
  {
    title: "Free-time terms",
    // Rendered by FreeTimeFields, not the generic field grid: which of these
    // apply depends on the carrier's model, and showing all three at once is
    // how a container ends up recorded as DEM 5 / DET 7 / combined 14 — three
    // numbers describing two different allowances, with no way to tell later
    // which the carrier actually issued.
    freeTime: true,
    fields: [],
  },
];

/** §34. The shapes a carrier's allowance can take. */
const FREE_TIME_MODELS = [
  { value: "SPLIT", label: "Separate demurrage and detention" },
  { value: "COMBINED", label: "Combined D&D" },
  { value: "NOT_CONFIRMED", label: "Not confirmed yet" },
];

/**
 * The shape every screen expects a job to have.
 *
 * Not data. Nothing renders these — the screens read the API, and an empty
 * database shows an empty board. This exists as the reference the adapter is
 * tested against: it is the record of which keys the screens dereference, and
 * it is what catches "job.chassis.filter is not a function" before a
 * controller does. Keep it in step with the screens, not with the database.
 */
export const SEED_JOBS = [
  {
    id: "EXP-260819-001",
    type: "Export",
    customer: "Sunrise Foods Pte Ltd",
    createdDate: "2026-08-19",
    booking: "BK-88213",
    billOfLading: "",
    houseBillOfLading: "",
    vessel: "Ever Lambent 044E",
    infoComplete: true,
    cmsCompleted: false,
    emptyYard: "Cogent Jurong Depot",
    deliveryAddress: "Sunrise Foods, Tuas South",
    containerQuantity: 2,
    containerSizeType: "40 HQ",
    container: { number: "", seal: "", tareKg: null, vgmKg: null },
    detailsSent: false,
    customerReady: false,
    transhipment: null,
    trips: [],
    exception: null,
  },
  {
    id: "EXP-260819-002",
    type: "Export",
    customer: "Meridian Trading",
    createdDate: "2026-08-18",
    booking: "BK-77104",
    billOfLading: "KMTCSHKB016289",
    houseBillOfLading: "SZX10267517",
    vessel: "CMA CGM Tigris 198W",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "YCH Tuas Depot",
    deliveryAddress: "Meridian Trading, Penjuru",
    container: { number: "", seal: "", tareKg: null, vgmKg: null },
    detailsSent: false,
    customerReady: false,
    transhipment: null,
    chassis: [{ unit: 4033, size: "40ft", heldSince: "2026-08-17" }],
    trips: [
      {
        id: "MOV-001",
        route: "YCH Tuas Depot → Meridian Trading",
        type: "Empty Collection",
        status: "Delivered",
        plannedDate: "2026-08-18",
        collectedTime: "18 Aug 2026, 09:10",
        deliveredTime: "18 Aug 2026, 14:20",
      },
    ],
    exception: {
      open: true,
      text: "Empty delivered without container details",
      openedAt: "18 Aug 2026, 15:20",
    },
  },
  {
    id: "EXP-260818-003",
    type: "Export",
    customer: "Anchor Chemicals",
    createdDate: "2026-08-15",
    booking: "BK-66489",
    vessel: "ONE Integrity 062E",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "Sembawang Container Yard",
    deliveryAddress: "Anchor Chemicals, Jurong Island",
    container: { number: "TGHU7719045", seal: "551902", tareKg: 3780, vgmKg: null },
    detailsSent: true,
    customerReady: true,
    readyConfirmedAt: "2026-08-15",
    transhipment: "pending",
    chassis: [{ unit: 4041, size: "40ft", heldSince: "2026-08-15" }],
    trips: [
      {
        id: "MOV-001",
        route: "Sembawang Container Yard → Anchor Chemicals",
        type: "Empty Collection",
        status: "Completed",
        plannedDate: "2026-08-15",
        collectedTime: "15 Aug 2026, 08:25",
        deliveredTime: "15 Aug 2026, 12:40",
      },
    ],
    exception: null,
  },
  {
    id: "EXP-260815-004",
    type: "Export",
    customer: "Pacific Rim Textiles",
    createdDate: "2026-08-10",
    booking: "BK-55312",
    vessel: "Maersk Lima 231W",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "Cogent Jurong Depot",
    deliveryAddress: "Pacific Rim Textiles, Kallang",
    container: { number: "ABCU9963012", seal: "772410", tareKg: 4010, vgmKg: 23780 },
    detailsSent: true,
    customerReady: true,
    transhipment: "pending",
    atCarparkSince: "2026-08-13",
    chassis: [{ unit: 4052, size: "40ft", heldSince: "2026-08-10" }],
    trips: [
      {
        id: "MOV-001",
        route: "Cogent Jurong Depot → Pacific Rim Textiles",
        type: "Empty Collection",
        status: "Completed",
        plannedDate: "2026-08-10",
        collectedTime: "10 Aug 2026, 07:40",
        deliveredTime: "10 Aug 2026, 11:35",
      },
      {
        id: "MOV-002",
        origin: "Pacific Rim Textiles",
        destination: CARPARK,
        type: "One-Way Loaded",
        status: "Completed",
        plannedDate: "2026-08-13",
        collectedTime: "13 Aug 2026, 16:10",
        deliveredTime: "13 Aug 2026, 18:05",
      },
    ],
    exception: null,
  },
  {
    id: "EXP-260819-005",
    type: "Export",
    customer: "Golden Harvest Foods",
    createdDate: "2026-08-17",
    booking: "BK-90551",
    vessel: "Ever Basis 110E",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "YCH Tuas Depot",
    deliveryAddress: "Golden Harvest Foods, Woodlands",
    container: { number: "TGHU2288471", seal: "994021", tareKg: 3920, vgmKg: 24480 },
    detailsSent: true,
    customerReady: true,
    transhipment: "pending",
    chassis: [{ unit: 4029, size: "40ft", heldSince: "2026-08-17" }],
    trips: [
      {
        id: "MOV-001",
        route: "YCH Tuas Depot → Golden Harvest Foods",
        type: "Empty Collection",
        status: "Completed",
        plannedDate: "2026-08-17",
        collectedTime: "17 Aug 2026, 08:00",
        deliveredTime: "17 Aug 2026, 12:15",
      },
    ],
    exception: null,
  },
  {
    id: "EXP-260817-006",
    type: "Export",
    customer: "Sunrise Foods Pte Ltd",
    createdDate: "2026-08-14",
    booking: "BK-61304",
    vessel: "OOCL Belgium 090W",
    infoComplete: true,
    cmsCompleted: true,
    emptyYard: "Cogent Jurong Depot",
    deliveryAddress: "Sunrise Foods, Tuas South",
    container: { number: "OOLU3309128", seal: "410625", tareKg: 3670, vgmKg: 22110 },
    detailsSent: true,
    customerReady: true,
    transhipment: "available",
    chassis: [{ unit: 4060, size: "40ft", heldSince: "2026-08-14", released: true }],
    trips: [
      {
        id: "MOV-001",
        route: "Cogent Jurong Depot → Sunrise Foods",
        type: "Empty Collection",
        status: "Completed",
        plannedDate: "2026-08-14",
        collectedTime: "14 Aug 2026, 07:55",
        deliveredTime: "14 Aug 2026, 11:20",
      },
      {
        id: "MOV-002",
        route: "Sunrise Foods → PSA Tuas",
        type: "Direct Laden to Port",
        status: "Delivered",
        plannedDate: "2026-08-17",
        collectedTime: "17 Aug 2026, 13:10",
        deliveredTime: "17 Aug 2026, 17:25",
      },
    ],
    exception: null,
  },
  {
    id: "EXP-260819-007",
    type: "Export",
    customer: "Keppel Marine Supplies",
    createdDate: "2026-08-19",
    booking: "BK-11820",
    vessel: "Wan Hai 503 076E",
    infoComplete: false,
    missingInformation: ["Empty delivery address", "Export clearance reference"],
    cmsCompleted: false,
    emptyYard: "Sembawang Container Yard",
    deliveryAddress: "",
    container: { number: "", seal: "", tareKg: null, vgmKg: null },
    detailsSent: false,
    customerReady: false,
    transhipment: null,
    trips: [],
    exception: null,
  },
  {
    id: "JOB-260819-001",
    type: "Import",
    customer: "Wellmark Industrial",
    createdDate: "2026-08-19",
    infoComplete: true,
    permitReceived: false,
    portnetReleased: true,
    terminal: "PSA Pasir Panjang",
    deliveryAddress: "Wellmark Industrial, Tuas",
    containers: [{ number: "MSKU3320981", state: "At terminal", lastFreeDay: "2026-08-22" }],
    trips: [],
    demurrageLastFreeDay: "2026-08-22",
    detentionLastFreeDay: "2026-08-27",
    exception: null,
  },
  {
    id: "JOB-260818-002",
    type: "Import",
    customer: "Kimtex Manufacturing",
    createdDate: "2026-08-18",
    infoComplete: true,
    permitReceived: true,
    portnetReleased: true,
    terminal: "PSA Brani",
    deliveryAddress: "Kimtex Manufacturing, Senoko",
    containers: [{ number: "OOLU8841250", state: "Ready", lastFreeDay: "2026-08-19" }],
    chassis: [{ unit: 2044, size: "20ft", heldSince: "2026-08-18" }],
    trips: [],
    demurrageLastFreeDay: "2026-08-19",
    detentionLastFreeDay: "2026-08-24",
    exception: null,
  },
  {
    id: "JOB-260817-003",
    type: "Import",
    customer: "Orient Steel Trading",
    createdDate: "2026-08-17",
    infoComplete: true,
    permitReceived: false,
    portnetReleased: true,
    terminal: "PSA Tuas",
    deliveryAddress: "Orient Steel Trading, Pioneer",
    containers: [
      { number: "TCNU5590183", state: "Delivered", lastFreeDay: "2026-08-21" },
      { number: "TCNU5590191", state: "Ready", lastFreeDay: "2026-08-21" },
      { number: "TCNU6620447", state: "Awaiting permit", lastFreeDay: "2026-08-21" },
    ],
    chassis: [
      { unit: 2051, size: "20ft", heldSince: "2026-08-17" },
      { unit: 2052, size: "20ft", heldSince: "2026-08-17" },
      { unit: 4038, size: "40ft", heldSince: "2026-08-17" },
    ],
    trips: [
      {
        id: "MOV-001",
        route: "PSA Tuas → Orient Steel Trading",
        type: "Import Delivery",
        status: "Completed",
        plannedDate: "2026-08-17",
        collectedTime: "17 Aug 2026, 08:40",
        deliveredTime: "17 Aug 2026, 12:55",
      },
      {
        id: "MOV-002",
        route: "PSA Tuas → Orient Steel Trading",
        type: "Import Delivery",
        status: "Pending",
        plannedDate: "2026-08-19",
        collectedTime: "",
        deliveredTime: "",
      },
    ],
    demurrageLastFreeDay: "2026-08-21",
    detentionLastFreeDay: "2026-08-26",
    exception: null,
  },
  {
    id: "JOB-260816-004",
    type: "Import",
    customer: "Wellmark Industrial",
    createdDate: "2026-08-16",
    infoComplete: true,
    permitReceived: true,
    portnetReleased: true,
    terminal: "PSA Keppel",
    emptyYard: "YCH Tuas Depot",
    deliveryAddress: "Wellmark Industrial, Tuas",
    containers: [{ number: "CSNU7213366", state: "Delivered", lastFreeDay: "2026-08-17" }],
    chassis: [{ unit: 2038, size: "20ft", heldSince: "2026-08-16" }],
    trips: [
      {
        id: "MOV-001",
        route: "PSA Keppel → Wellmark Industrial",
        type: "Import Delivery",
        status: "Completed",
        plannedDate: "2026-08-16",
        collectedTime: "16 Aug 2026, 09:05",
        deliveredTime: "16 Aug 2026, 13:30",
      },
      {
        id: "MOV-002",
        route: "Wellmark Industrial → YCH Tuas Depot",
        type: "Empty Return",
        status: "Pending",
        plannedDate: null,
        collectedTime: "",
        deliveredTime: "",
      },
    ],
    demurrageLastFreeDay: "2026-08-17",
    detentionLastFreeDay: "2026-08-21",
    exception: null,
  },
  {
    id: "JOB-260819-005",
    type: "Import",
    customer: "Nexus Polymers",
    createdDate: "2026-08-19",
    infoComplete: false,
    missingInformation: ["Delivery address", "Gross weight"],
    permitReceived: false,
    portnetReleased: false,
    terminal: "PSA Pasir Panjang",
    deliveryAddress: "",
    containers: [{ number: "SEGU4402819", state: "At terminal", lastFreeDay: "2026-08-24" }],
    trips: [],
    demurrageLastFreeDay: "2026-08-24",
    detentionLastFreeDay: "2026-08-29",
    exception: null,
  },
];

// -----------------------------------------------------------------------------
// Derived operational logic — no displayed state is stored separately.
// -----------------------------------------------------------------------------

function jobContainers(job) {
  if (Array.isArray(job.containers) && job.containers.length) return job.containers;
  if (job.type === "Export") return [{
    ref: "C1",
    ...(job.container || { number: "", seal: "", tareKg: null, vgmKg: null }),
    detailsSent: Boolean(job.detailsSent),
    customerReady: Boolean(job.customerReady),
    stuffingLocation: job.deliveryAddress || "",
  }];
  return [];
}

function movementMatchesContainer(trip, container, index, total) {
  if (trip.containerRef) return trip.containerRef === container.ref;
  if (trip.containerNumber) return trip.containerNumber === container.number;
  return total === 1 || index === 0;
}

/**
 * A form field is text; the draft wants a number or nothing.
 *
 * Tolerant of what actually arrives. Asked for a bare number, an extraction
 * can still return "990.0 KGM" or "1,234 KG", and a strict Number() turns both
 * into NaN — losing a weight that was read correctly. The unit and separators
 * are stripped rather than rejected; a field with no digits at all is genuinely
 * absent and returns null.
 */
function numberOrNull(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const match = /-?\d+(?:\.\d+)?/.exec(text);
  return match ? Number(match[0]) : null;
}

function parseDay(value) {
  return new Date(`${value}T12:00:00+08:00`);
}

/**
 * Format a day, or say it is not set.
 *
 * Intl.format throws RangeError on an invalid Date rather than producing
 * something harmless, so an absent date crashes the screen it appears on
 * instead of leaving a blank cell. A job that has not reached the port yet
 * genuinely has no last free day, so this is the ordinary case, not an error.
 */
/**
 * Every date in the application, written the one way.
 *
 * DD/MM/YYYY, because that is what the shipping documents say and what the
 * people reading this screen read all day. "19 September 2026" is prettier and
 * costs a beat of translation each time, and a controller comparing a screen
 * against a carrier's notice should not be translating anything.
 *
 * Padded to two digits so the column lines up and so 1/9 cannot be misread as
 * a different length of number than 11/9. The separator is a slash, not a
 * dash, to keep it distinct from the ISO form the API speaks.
 */
function formatDay(value, fallback = "Not set") {
  if (!value) return fallback;
  const date = parseDay(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/**
 * The same date with the weekday in front.
 *
 * Used where the question is "when do I have to do this", which a person
 * answers in weekdays rather than dates: Fri 18/09/2026 says something
 * 18/09/2026 does not.
 */
function formatDayShort(value, fallback = "Not scheduled") {
  if (!value) return fallback;
  const date = parseDay(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const weekday = new Intl.DateTimeFormat("en-SG", { weekday: "short" }).format(date);
  return `${weekday} ${formatDay(value)}`;
}

function dayDifference(from, to) {
  return Math.round((parseDay(to) - parseDay(from)) / 86400000);
}

function daysUntil(value) {
  return dayDifference(operationalToday(), value);
}

function daysHeld(value) {
  return dayDifference(value, operationalToday());
}

function activeTrips(job) {
  return job.trips.filter((trip) => trip.status !== "Cancelled");
}

function tripOfType(job, names) {
  return activeTrips(job).find((trip) => names.includes(trip.type));
}

function exportContainerStatus(job, container, index) {
  const containers = jobContainers(job);
  const trips = activeTrips(job).filter((trip) => movementMatchesContainer(trip, container, index, containers.length));
  const finalPort = trips.find((trip) => ["Direct Laden to Port", "Carpark to Port"].includes(trip.type));
  const oneWay = trips.find((trip) => trip.type === "One-Way Loaded");
  const ladenTrip = trips.find((trip) => ["Direct Laden to Port", "One-Way Loaded", "Carpark to Port"].includes(trip.type));
  const emptyTrip = trips.find((trip) => trip.type === "Empty Collection");

  if (finalPort?.status === "Completed") return "Completed";
  if (finalPort?.status === "Delivered") return "Delivered to Port";
  if (job.atCarparkSince && job.transhipment === "available") return "Ready for Port Delivery";
  if (oneWay?.status === "Completed" && job.transhipment === "pending") return "Awaiting T/T";
  if (oneWay?.status === "Completed") return "At Carpark";
  if (ladenTrip && ["Collected", "In Transit"].includes(ladenTrip.status)) return "Laden Collected";
  if (container.vgmKg && job.transhipment === "pending") return "Awaiting T/T";
  if (container.customerReady && !container.vgmKg) return "Awaiting VGM";
  if (job.carparkRequested && oneWay?.status === "Pending") return "Ready for One-Way Loaded Trip";
  if (finalPort?.type === "Direct Laden to Port" && finalPort.status === "Pending") return "Ready for Direct Laden Trip";
  if (job.transhipment === "not_available" && !job.carparkRequested) return "Carpark Decision Needed";
  if (job.transhipment === "not_available" && job.carparkRequested === false) return "Delivery Path Needed";
  if (container.detailsSent && !container.customerReady) return "Awaiting Customer Stuffing";
  if (container.number && !container.detailsSent) return "Awaiting Container Details Notification";
  if (["Delivered", "Completed"].includes(emptyTrip?.status) && !container.number) return "Empty Delivered";
  if (["Collected", "In Transit"].includes(emptyTrip?.status)) return "Empty Collected";
  if (emptyTrip?.plannedDate) return "Empty Collection Scheduled";
  if (job.infoComplete && job.cmsCompleted) return "Ready for Empty Collection";
  if (job.infoComplete && !job.cmsCompleted) return "Awaiting CMS";
  return "Incomplete";
}

function exportStatus(job) {
  const statuses = jobContainers(job).map((container, index) => exportContainerStatus(job, container, index));
  if (statuses.every((status) => status === "Completed")) return "Completed";
  if (statuses.some((status) => ["Completed", "Delivered to Port"].includes(status))) return "Partially Delivered";
  const progressed = statuses.filter((status) => !["Incomplete", "Awaiting CMS", "Ready for Empty Collection", "Empty Collection Scheduled"].includes(status)).length;
  if (progressed > 0 && progressed < statuses.length) return "Partially Collected";
  const precedence = ["Incomplete", "Awaiting CMS", "Empty Delivered", "Awaiting Container Details Notification", "Awaiting Customer Stuffing", "Awaiting VGM", "Carpark Decision Needed", "Delivery Path Needed", "Awaiting T/T", "Ready for Empty Collection", "Empty Collection Scheduled", "Empty Collected", "Ready for One-Way Loaded Trip", "Ready for Direct Laden Trip", "At Carpark", "Ready for Port Delivery", "Laden Collected", "Delivered to Port"];
  return precedence.find((status) => statuses.includes(status)) || statuses[0] || "Incomplete";
}

function importStatus(job) {
  const trips = activeTrips(job);
  const allTripsDone = trips.length > 0 && trips.every((trip) => trip.status === "Completed");
  const emptyReturn = tripOfType(job, ["Empty Return"]);
  const states = job.containers.map((container) => container.state);
  const deliveredCount = states.filter((state) => state === "Delivered").length;
  const collectedCount = states.filter((state) => state === "Collected").length;

  if (allTripsDone && emptyReturn?.status === "Completed") return "Completed";
  if (deliveredCount > 0 && emptyReturn && emptyReturn.status !== "Completed") return "Empty Return Pending";
  if (deliveredCount === job.containers.length) return "Delivered";
  if (deliveredCount > 0 && deliveredCount < job.containers.length) return "Partially Delivered";
  if (collectedCount === job.containers.length && deliveredCount === 0) return "Collected";
  if (collectedCount > 0 && collectedCount < job.containers.length && deliveredCount === 0) return "Partially Collected";
  if (trips.some((trip) => trip.plannedDate && !trip.collectedTime)) return "Transport Assigned";
  if (job.infoComplete && job.permitReceived && job.portnetReleased) return "Ready for Collection";
  if (job.infoComplete && job.permitReceived && !job.portnetReleased) return "Awaiting Portnet";
  if (job.infoComplete && !job.permitReceived) return "Awaiting Permit";
  return "Incomplete";
}

export function jobStatus(job) {
  if (job.derived) return job.derived.status;
  return job.type === "Export" ? exportStatus(job) : importStatus(job);
}

function deadlineRisk(job) {
  if (job.type !== "Import" || ["Completed", "Delivered"].includes(jobStatus(job))) return null;
  const emptyReturnPending = jobStatus(job) === "Empty Return Pending";
  const remaining = daysUntil(emptyReturnPending ? job.detentionLastFreeDay : job.demurrageLastFreeDay);
  const clockName = emptyReturnPending ? "Detention free time" : "Last free day";
  if (remaining < 0) return { remaining, text: `${clockName} passed ${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? "" : "s"} ago.` };
  if (remaining === 0) return { remaining, text: `${clockName} ends today.` };
  return null;
}

function overdueTrip(job) {
  return activeTrips(job).find(
    (trip) => trip.plannedDate && daysUntil(trip.plannedDate) < 0 && !trip.collectedTime && trip.status !== "Completed",
  );
}

function internalBlocker(job) {
  const status = jobStatus(job);
  if (!job.infoComplete) return `Job information is incomplete: ${(job.missingInformation || []).join(" and ")}.`;
  if (status === "Awaiting CMS") return "CMS has not been completed.";
  if (status === "Empty Delivered") return "The empty was delivered but its container details were not recorded.";
  if (status === "Awaiting Container Details Notification") return "Container details have not been sent to the customer.";
  if (status === "Carpark Decision Needed") return "The customer has not been asked whether to use the company carpark.";
  if (status === "Delivery Path Needed") return "The company carpark was declined and no laden delivery path has been agreed.";
  if (status === "Ready for Empty Collection") return "The empty collection has not been arranged.";
  if (status === "Ready for One-Way Loaded Trip") return "The one-way loaded trip has not been arranged.";
  if (status === "Ready for Direct Laden Trip") return "The direct laden trip has not been arranged.";
  if (status === "Ready for Port Delivery") return "The carpark-to-port trip has not been arranged.";
  if (status === "Delivered to Port") return "The delivered job has not been closed and its chassis released.";
  if (status === "Empty Return Pending") return "The empty return has not been arranged.";
  if (status === "Ready for Collection") return "The import collection has not been arranged.";
  if (job.type === "Export" && ["Partially Collected", "Partially Delivered"].includes(status)) return `${jobContainers(job).filter((container, index) => !["Completed", "Delivered to Port"].includes(exportContainerStatus(job, container, index))).length} container movements remain outstanding.`;
  if (status === "Transport Assigned" && overdueTrip(job)) return "A planned trip is overdue and has not been collected.";
  return null;
}

function externalBlocker(job) {
  const status = jobStatus(job);
  if (status === "Awaiting Permit") return "The customer has not provided the permit.";
  if (status === "Awaiting Portnet") return "Portnet release has not been confirmed by the carrier.";
  if (status === "Awaiting VGM") return "The customer has not provided the VGM.";
  if (status === "Awaiting Customer Stuffing") return "The customer has not confirmed that stuffing is complete.";
  if (status === "Awaiting T/T") return "The carrier has not confirmed transhipment space.";
  if (status === "Partially Delivered" && !job.permitReceived) return "One container is still waiting for the customer permit.";
  return null;
}

export function blockingReason(job) {
  if (job.derived) return job.derived.blocking;
  return deadlineRisk(job)?.text || (overdueTrip(job) ? "A planned trip is overdue." : null) || internalBlocker(job) || externalBlocker(job) || "No blocking issue.";
}

export function waitingOn(job) {
  if (job.derived) return job.derived.waitingOn;
  if (deadlineRisk(job) || overdueTrip(job) || internalBlocker(job)) return "Us";
  const status = jobStatus(job);
  if (job.type === "Export" && ["Partially Collected", "Partially Delivered"].includes(status)) return "Us";
  if (["Awaiting Permit", "Awaiting VGM", "Awaiting Customer Stuffing", "Partially Delivered"].includes(status)) return "Customer";
  if (["Awaiting Portnet", "Awaiting T/T"].includes(status)) return "Carrier";
  return "Nobody";
}

export function nextAction(job) {
  if (job.derived) return job.derived.nextAction;
  const risk = deadlineRisk(job);
  if (risk) return risk.remaining < 0 ? "Collect immediately and escalate charges" : "Collect today before free time ends";
  if (overdueTrip(job)) return "Contact the transport desk about the overdue trip";

  const status = jobStatus(job);
  const actions = {
    Incomplete: "Complete the missing job information",
    "Awaiting CMS": "Record CMS completed",
    "Empty Delivered": "Record container details",
    "Awaiting Container Details Notification": "Send container details to customer",
    "Empty Collected": "Track the empty delivery",
    "Empty Collection Scheduled": "Dispatch the empty collection",
    "Ready for Empty Collection": "Arrange empty collection",
    "Awaiting Customer Stuffing": "Ask the customer to confirm stuffing is complete",
    "Awaiting VGM": "Ask the customer for VGM",
    "Awaiting T/T": "Confirm transhipment space with the carrier",
    "Carpark Decision Needed": "Ask whether the customer wants the company carpark",
    "Delivery Path Needed": "Agree another laden delivery path with the customer",
    "Ready for One-Way Loaded Trip": "Arrange the one-way loaded trip",
    "Ready for Direct Laden Trip": "Arrange the direct laden-to-port trip",
    "Ready for Port Delivery": "Arrange the carpark-to-port trip",
    "Delivered to Port": "Close the job and release the chassis",
    "Awaiting Permit": "Ask the customer for the permit",
    "Awaiting Portnet": "Follow up on Portnet release",
    "Ready for Collection": "Arrange import collection",
    "Transport Assigned": "Monitor the planned collection",
    "Partially Delivered": "Clear the remaining container for delivery",
    "Partially Collected": "Work the next outstanding container movement",
    "Empty Return Pending": "Arrange empty return before detention ends",
    Delivered: "Arrange the empty return",
    Completed: "No action required",
  };
  return actions[status] || "Review this job";
}

export function location(job) {
  if (job.derived) return job.derived.location;
  if (jobContainers(job).length > 1) return "Multiple locations";
  const trips = activeTrips(job);
  const latest = [...trips].reverse().find((trip) => ["Collected", "In Transit", "Delivered", "Completed"].includes(trip.status));
  if (latest?.status === "Collected" || latest?.status === "In Transit") return "On the road";
  // The destination, read rather than parsed back out of a display string.
  // This did latest.route.split("→").at(-1) — and the API adapter produces
  // origin and destination, never a joined route, so on real data it was
  // calling .split on undefined.
  if (latest && ["Delivered", "Completed"].includes(latest.status)) {
    return latest.destination || (job.type === "Import" ? job.terminal : job.emptyYard) || "Unknown";
  }
  return job.type === "Import" ? job.terminal : job.emptyYard || "Not yet collected";
}

function primaryContainer(job) {
  const containers = jobContainers(job);
  if (containers.length === 1) return containers[0].number || containers[0].ref || "Not yet known";
  return `${containers.length} containers`;
}

function ageInDays(job) {
  return daysHeld(job.createdDate);
}

function ageLabel(job) {
  const days = ageInDays(job);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function requiredBy(job) {
  if (job.type === "Import") {
    const deadline = jobStatus(job) === "Empty Return Pending" ? job.detentionLastFreeDay : job.demurrageLastFreeDay;
    const days = daysUntil(deadline);
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Today";
    return `${days} days`;
  }
  if (waitingOn(job) === "Us") return "Today";
  if (waitingOn(job) === "Customer") return "Customer reply";
  if (waitingOn(job) === "Carrier") return "Carrier reply";
  return "—";
}

function urgency(job) {
  const risk = deadlineRisk(job);
  if (risk) return 10000 - risk.remaining * 50;
  if (overdueTrip(job)) return 9000;
  const owner = waitingOn(job);
  let score = owner === "Us" ? 7000 : owner === "Customer" ? 5000 : owner === "Carrier" ? 4000 : 1000;
  if (job.exception?.open) score += 800;
  if (job.atCarparkSince) score += 600 + daysHeld(job.atCarparkSince) * 10;
  score += ageInDays(job);
  return score;
}

function isActionRequired(job) {
  const status = jobStatus(job);
  if (status === "Completed") return false;
  if (["Ready for Empty Collection", "Ready for Direct Laden Trip", "Ready for One-Way Loaded Trip", "Ready for Port Delivery"].includes(status)) {
    return Boolean(deadlineRisk(job) || overdueTrip(job));
  }
  return waitingOn(job) !== "Nobody" || status === "Delivered to Port";
}

function readiness(job) {
  if (job.type === "Import") {
    const rows = [
      { key: "infoComplete", label: "Job information", ok: job.infoComplete, value: job.infoComplete ? "Complete" : "Missing information" },
      { key: "permitReceived", label: "Permit received", ok: job.permitReceived, value: job.permitReceived ? "Received" : "Not received", actionable: true },
      { key: "portnetReleased", label: "Portnet released", ok: job.portnetReleased, value: job.portnetReleased ? "Released" : "Not released", actionable: true },
    ];
    return { rows, ready: rows.every((row) => row.ok), reason: rows.find((row) => !row.ok)?.label || "All collection checkpoints passed" };
  }

  const containers = jobContainers(job);
  const identified = containers.filter((container) => container.number && container.seal && container.tareKg).length;
  const detailsSent = containers.filter((container) => container.detailsSent).length;
  const customerReady = containers.filter((container) => container.customerReady).length;
  const vgmReady = containers.filter((container) => container.vgmKg && Number(container.vgmKg) > Number(container.tareKg || 0)).length;
  const rows = [
    { key: "infoComplete", label: "Job information", ok: job.infoComplete, value: job.infoComplete ? "Complete" : "Missing information" },
    { key: "cmsCompleted", label: "CMS completed", ok: job.cmsCompleted, value: job.cmsCompleted ? "Completed" : "Pending" },
    { key: "containerDetails", label: "Container identity", ok: identified === containers.length, value: `${identified} / ${containers.length} identified` },
    { key: "detailsSent", label: "Details sent", ok: detailsSent === containers.length, value: `${detailsSent} / ${containers.length} sent` },
    { key: "customerReady", label: "Customer ready", ok: customerReady === containers.length, value: `${customerReady} / ${containers.length} ready` },
    { key: "vgm", label: "VGM validated", ok: vgmReady === containers.length, value: `${vgmReady} / ${containers.length} valid` },
  ];
  const firstMissing = rows.find((row) => !row.ok);
  return { rows, ready: rows.every((row) => row.ok), reason: firstMissing ? `${firstMissing.label}: ${firstMissing.value}` : "Every container has passed its laden gate." };
}



function tripStatusTone(trip) {
  if (trip.status === "Pending") return "border-slate-200 bg-slate-100 text-slate-700";
  if (trip.status === "Cancelled") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}


function WaitingPill({ owner }) {
  // "Us" is the only one that means act, so it is the only one marked.
  const state = owner === "Us" ? "blocked" : owner === "Customer" ? "warn"
    : owner === "Nobody" ? "ready" : "idle";
  return <span className="gl-pill" data-state={state}>{owner}</span>;
}

/**
 * State is a small mark plus the word, never a filled block.
 *
 * A row of filled pills reads as decoration and competes with the one value
 * that matters. A dot carries the same information at a fraction of the
 * visual weight, and the word carries it for anyone who cannot see colour.
 */
function statusState(status) {
  if (["Exception", "Cancelled", "On Hold"].includes(status)) return "blocked";
  if (/^Awaiting|^Incomplete|Pending$/.test(status)) return "warn";
  if (/^Ready|Delivered|Completed|Returned/.test(status)) return "ready";
  return "idle";
}

function StatusPill({ status, large = false, flash = false }) {
  return (
    <span
      className={`gl-pill ${large ? "text-[17px]" : ""} ${flash ? "greenlit-release-flash" : ""}`}
      data-state={statusState(status)}
    >
      {status}
    </span>
  );
}

/**
 * A panel: a white header with the title, and the body below it.
 *
 * v5 tried solid coloured headers, one hue per kind of information. On screen
 * they were heavy rather than helpful — a wall of saturated bars competing
 * with the content, and the action links inside them unreadable. Reverted.
 * `kind` is still accepted and ignored, because the panels still declare what
 * they hold and that is worth keeping if colour returns in a quieter form.
 */
function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function BoardState({ source, onRetry, onAddDocument }) {
  if (source === "loading") {
    return (
      <div role="status" className="gl-panel mx-auto mt-10 max-w-[560px] p-8 text-center">
        <p className="gl-body">Loading the board&hellip;</p>
      </div>
    );
  }

  if (source === "offline") {
    return (
      <div role="alert" className="gl-panel mx-auto mt-10 max-w-[560px] p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-[color:var(--gl-state-blocked)]" aria-hidden="true" />
        <h2 className="gl-title mt-4">The board could not be loaded</h2>
        <p className="gl-body mt-2">
          Greenlit could not reach the server, so nothing is shown rather than
          something out of date. Any job already in progress is unaffected.
        </p>
        <button type="button" onClick={onRetry}
          className="mt-6 h-11 rounded border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-medium text-white hover:bg-[color:var(--gl-accent-hover)]">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="gl-panel mx-auto mt-10 max-w-[560px] p-8 text-center">
      <FileText className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
      <h2 className="gl-title mt-4">No jobs yet</h2>
      <p className="gl-body mt-2">
        Upload an arrival notice and Greenlit will read it, match the company,
        and open the job for you.
      </p>
      <button type="button" onClick={onAddDocument}
        className="mt-6 h-11 rounded border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-medium text-white hover:bg-[color:var(--gl-accent-hover)]">
        Upload a document
      </button>
    </div>
  );
}

function UnknownCompanyPrompt({ pending, onCancel, onChange, onCreated }) {
  const [saving, setSaving] = useState(false);

  async function create(event) {
    event.preventDefault();
    setSaving(true);
    onChange({ error: "" });
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: pending.code,
          companyName: pending.companyName,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        onChange({ error: payload.error ?? `Could not save (HTTP ${response.status}).` });
        return;
      }
      // The document that prompted this is applied straight away, so the
      // operator is not left to remember what they were in the middle of.
      await onCreated(pending.document);
    } catch {
      onChange({ error: "Could not reach the server. Nothing was saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[color:var(--gl-ink-strong)]/25 p-4">
      <form onSubmit={create} role="dialog" aria-modal="true" aria-labelledby="new-company-title"
        className="w-full max-w-[520px] rounded-lg border border-slate-300 bg-white p-6 shadow-[0_16px_48px_rgba(15,23,42,0.24)]">
        <h2 id="new-company-title" className="text-[22px] font-medium text-slate-900">
          Add this company?
        </h2>
        <p className="mt-2 text-[17px] text-slate-700">
          No company in the master matches the consignee on this document.
        </p>

        <label className="mt-5 flex flex-col gap-1">
          <span className="text-[15px] font-medium text-slate-700">Company name</span>
          <input value={pending.companyName} onChange={(e) => onChange({ companyName: e.target.value })}
            className="h-11 rounded border border-slate-400 px-3 text-[17px] text-slate-900" required />
        </label>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[15px] font-medium text-slate-700">Code</span>
          <input value={pending.code} onChange={(e) => onChange({ code: e.target.value.toUpperCase() })}
            className="h-11 w-[160px] rounded border border-slate-400 px-3 text-[17px] text-slate-900"
            required maxLength={6} />
          <span className="text-[15px] text-slate-600">
            Goes on every job reference for this company — {pending.code || "ABC"}-001, {pending.code || "ABC"}-002.
            It cannot be changed later.
          </span>
        </label>

        {pending.error ? (
          <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-[17px] text-red-900">
            {pending.error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="h-11 rounded border-0 bg-[color:var(--gl-accent)] px-4 text-[17px] font-medium text-white hover:bg-[color:var(--gl-accent-hover)] disabled:opacity-60">
            {saving ? "Adding…" : "Add and apply document"}
          </button>
          <button type="button" onClick={onCancel}
            className="h-11 rounded border border-slate-400 bg-white px-4 text-[17px] text-slate-800 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}







/**
 * Keyboard operation for the action register.
 *
 * PRD §61.3 describes the target workflow as opening the queue, filtering to
 * waiting on us, and working the list top to bottom. That is a keyboard task.
 * Roving focus: exactly one row is tabbable, so Tab leaves the table rather
 * than walking every row.
 */
function useRegisterKeyboard(count, onActivate) {
  const [active, setActive] = useState(-1);
  const rowsRef = useRef([]);

  const focusRow = (index) => {
    setActive(index);
    const node = rowsRef.current[index];
    if (node) {
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "nearest" });
    }
  };

  const onKeyDown = (event) => {
    // Never hijack keys while someone is typing.
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!count) return;

    const key = event.key;
    if (key === "Enter" || key === "o") {
      if (active >= 0) { event.preventDefault(); onActivate(active); }
      return;
    }
    if (key === "Escape") { setActive(-1); event.currentTarget.blur?.(); return; }

    let next = null;
    if (key === "ArrowDown" || key === "j") next = active < 0 ? 0 : Math.min(count - 1, active + 1);
    else if (key === "ArrowUp" || key === "k") next = active < 0 ? 0 : Math.max(0, active - 1);
    else if (key === "Home") next = 0;
    else if (key === "End") next = count - 1;
    if (next === null) return;

    event.preventDefault();
    focusRow(next);
  };

  return { active, setActive, rowsRef, onKeyDown };
}

/**
 * Maps a seed job to the neutral row shape by running the in-component
 * derivation. The live path maps from the API instead — see rowsFromApi.
 */
function rowFromSeedJob(job) {
  return {
    id: job.id,
    type: job.type,
    container: primaryContainer(job),
    status: jobStatus(job),
    blocking: blockingReason(job),
    nextAction: nextAction(job),
    waitingOn: waitingOn(job),
    age: ageLabel(job),
    requiredBy: requiredBy(job),
    // Whether a carrier deadline has passed — the one thing on this board
    // that is costing money right now, and so the one thing shown loudly.
    overdue: Boolean(deadlineRisk(job)),
    openable: true,
  };
}

/**
 * Presentational only. It renders whatever derived values it is handed and
 * computes none of its own, so the same table can show seed data or values
 * computed server-side by @greenlit/engine.
 */
function ActionTable({ rows, onOpen, compact = false }) {
  const jobs = rows;
  const { active, setActive, rowsRef, onKeyDown } = useRegisterKeyboard(
    jobs.length,
    (index) => { const row = jobs[index]; if (row && row.openable !== false) onOpen(row.id); },
  );
  if (!jobs.length) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center">
        <CheckCircle2 className="h-11 w-10 text-emerald-700" aria-hidden="true" />
        <p className="text-xl font-semibold text-slate-950">No jobs match this filter.</p>
        <p className="text-[17px] text-slate-700">Choose another filter to continue.</p>
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="hidden max-h-[70vh] overflow-auto xl:block"
        onKeyDown={onKeyDown}
        role="region"
        aria-label="Action required register. Use arrow keys or J and K to move, Enter to open."
      >
        <table className="gl-table min-w-[1080px]">
          <thead>
            <tr>
              {[
                "Job", "Container", "Status", "Blocking", "Next action", "Waiting on",
                ...(compact ? [] : ["Age", "Required by"]),
              ].map((heading, index) => (
                <th key={`${heading}-${index}`}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, index) => (
              /* The whole row is the target. MASTER v2 §4.2: a dense table must
                 not carry a trailing chevron column. */
              <tr
                key={job.id}
                ref={(node) => { rowsRef.current[index] = node; }}
                tabIndex={active === index || (active < 0 && index === 0) ? 0 : -1}
                data-active={active === index ? "true" : undefined}
                aria-selected={active === index}
                onFocus={() => setActive(index)}
                onClick={() => job.openable !== false && onOpen(job.id)}
              >
                <td>
                  <span className="gl-data gl-ref">{job.id}</span>
                  <div className="gl-caption mt-0.5">{job.type}</div>
                </td>
                <td><span className="gl-data">{job.container}</span></td>
                <td><StatusPill status={job.status} /></td>
                {/* Supporting copy: deliberately quieter than the action. */}
                <td className="gl-body gl-muted max-w-[260px]">{job.blocking}</td>
                {/* The one strong value in the row. */}
                <td className="gl-body gl-strong max-w-[240px]" style={{ fontWeight: 500 }}>{job.nextAction}</td>
                <td><WaitingPill owner={job.waitingOn} /></td>
                {!compact ? <td><span className="gl-data">{job.age}</span></td> : null}
                {!compact ? <td><span className="gl-data">{job.requiredBy}</span></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-200 xl:hidden">
        {jobs.map((job) => (
          <button key={job.id} type="button" onClick={() => onOpen(job.id)} className="block min-h-44 w-full px-5 py-5 text-left transition-colors duration-200 hover:bg-sky-50/70 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-600">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-[var(--gl-accent)] underline decoration-1 underline-offset-4">{job.id}</div>
                <div className="mt-1 font-normal text-slate-600">{job.container} · {job.type}</div>
              </div>
              <StatusPill status={job.status} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div><span className="font-semibold text-slate-600">Blocking: </span><span className="font-normal text-slate-600">{job.blocking}</span></div>
              <div><span className="font-semibold text-slate-600">Next: </span><span className="font-semibold text-slate-950">{job.nextAction}</span></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <WaitingPill owner={job.waitingOn} />
              {!compact ? <span className="font-semibold text-slate-800">Age {job.age} · Required {job.requiredBy}</span> : null}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function TripTable({ trips, flashTripId, onOpenTrip }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1160px] border-collapse text-left text-[17px]">
        <thead className="bg-[var(--gl-bg-subtle)] text-[color:var(--gl-ink)]">
          <tr>
            {["Reference", "Container", "Route", "Type", "Status", "Planned date", "Collected", "Delivered", ""].map((heading, index) => (
              <th key={`${heading}-${index}`} className="border-r border-slate-600 px-4 py-4 text-[17px] font-semibold last:border-r-0">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trips.length ? trips.map((trip) => {
            const pending = trip.status === "Pending";
            const cancelled = trip.status === "Cancelled";
            return (
              <tr key={trip.id} className={`border-b border-slate-200 align-top ${pending ? "bg-slate-50" : "bg-white"} ${cancelled ? "line-through opacity-75" : ""} ${flashTripId === trip.id ? "greenlit-new-row" : ""}`}>
                <td className="px-4 py-4 font-semibold text-slate-950">
                  {trip.id}
                  {trip.createdAutomatically ? <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[17px] font-semibold text-emerald-800"><CircleDot className="h-4 w-4" />Created automatically</div> : null}
                </td>
                <td className="px-4 py-4"><div className="font-semibold text-slate-950">{trip.containerRef || "—"}</div><div className="mt-1 break-all text-[15px] font-normal text-slate-600">{trip.containerNumber || "Identity pending"}</div></td>
                <td className="max-w-[260px] px-4 py-4 font-semibold text-slate-900">{trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : trip.origin || trip.destination || "Route not set"}</td>
                <td className="px-4 py-4 font-semibold text-slate-950">{trip.type}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1 font-semibold ${tripStatusTone(trip)}`}>{trip.status}</span>
                  {pending && !trip.plannedDate ? <div className="mt-2 font-normal text-slate-600">Not yet scheduled</div> : null}
                  {cancelled ? <div className="mt-2 font-semibold text-red-900">{trip.cancelledReason}</div> : null}
                </td>
                <td className="px-4 py-4 font-semibold text-slate-900">{formatDayShort(trip.plannedDate)}</td>
                <td className="px-4 py-4 font-semibold text-slate-900">{trip.collectedTime || "—"}</td>
                <td className="px-4 py-4 font-semibold text-slate-900">{trip.deliveredTime || "—"}</td>
                <td className="px-4 py-4"><button type="button" onClick={() => onOpenTrip(trip.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 font-semibold text-[var(--gl-accent)] hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Manage <ChevronRight className="h-5 w-5" /></button></td>
              </tr>
            );
          }) : (
            <tr><td colSpan="9" className="px-5 py-8 text-center text-[17px] font-normal text-slate-600">No trips have been created for this job. Use “Add trip” to arrange the next movement.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}



function useUrlState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const params = new URLSearchParams(globalThis.location?.search ?? "");
      return params.get(key) ?? initial;
    } catch { return initial; }
  });

  useEffect(() => {
    try {
      const url = new URL(globalThis.location.href);
      if (value === initial) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
      globalThis.history?.replaceState(null, "", url);
    } catch { /* non-fatal: the view still works, it just will not survive a reload */ }
  }, [key, value, initial]);

  return [value, setValue];
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "us", label: "Waiting on us" },
  { id: "customer", label: "Waiting on customer" },
  { id: "carrier", label: "Waiting on carrier" },
  { id: "import", label: "Import" },
  { id: "export", label: "Export" },
];

function ActionRequired({ jobs, filter, setFilter, dashboardFilter, clearDashboardFilter, onOpen }) {
  const filtered = jobs.filter((job) => {
    if (dashboardFilter === "active" && jobStatus(job) === "Completed") return false;
    if (dashboardFilter === "blocked" && readiness(job).ready) return false;
    if (dashboardFilter === "exceptions" && !job.exception?.open) return false;
    if (dashboardFilter === "carpark" && location(job) !== CARPARK) return false;
    if (dashboardFilter === "freeTime" && !(job.type === "Import" && !["Delivered", "Empty Return Pending", "Completed"].includes(jobStatus(job)) && daysUntil(job.demurrageLastFreeDay) <= 3)) return false;
    if (filter === "us") return waitingOn(job) === "Us";
    if (filter === "customer") return waitingOn(job) === "Customer";
    if (filter === "carrier") return waitingOn(job) === "Carrier";
    if (filter === "import") return job.type === "Import";
    if (filter === "export") return job.type === "Export";
    return true;
  });

  const dashboardLabels = { active: "Active jobs", blocked: "Blocked jobs", exceptions: "Exceptions open", carpark: "At our carpark", freeTime: "Free time at risk" };

  return (
    <main id="main-content" className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="pb-2">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">Action Required</h1>
        <p className="mt-2 text-[17px] font-normal text-slate-600">Work top to bottom. Doing the action removes the row.</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3" aria-label="Action filters">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" onClick={() => { setFilter(item.id); clearDashboardFilter(); }} aria-pressed={filter === item.id && !dashboardFilter} className={`min-h-12 rounded-md border px-5 py-2 text-[17px] font-semibold focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${filter === item.id && !dashboardFilter ? "border-[var(--gl-accent)] bg-[var(--gl-accent)] text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}>
            {item.label}
          </button>
        ))}
      </div>

      {dashboardFilter ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-[17px] font-medium text-sky-900">
          Dashboard filter: {dashboardLabels[dashboardFilter] || dashboardFilter}
          <button type="button" onClick={clearDashboardFilter} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-sky-300 bg-white px-3 font-semibold text-[var(--gl-accent)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600"><X className="h-5 w-5" />Clear</button>
        </div>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Urgency-ranked action list">
        <ActionTable rows={filtered.map(rowFromSeedJob)} onOpen={onOpen} />
      </section>
    </main>
  );
}

/**
 * §34.4. What the carrier's clock says, in words.
 *
 * The number is not the message. A controller scanning a board needs to know
 * whether this box costs money today, and "3 days left" answers that where
 * "LFD 14 Sep" asks them to work it out against today's date, forty times a
 * morning.
 *
 * Colour never carries the meaning on its own: every state says its words too,
 * because a colour is the first thing to go for a reader who has been looking
 * at a screen since seven.
 */
function FreeTimeRow({ clock }) {
  // v5. A clock that is costing money is a solid block, not a tinted one: it
  // is the loudest thing on the job because it is the only thing on the job
  // with a running meter. Everything else takes the pale money wash, so it
  // still reads as belonging to free time without competing.
  // A coloured rail and the words, on white. The solid block this replaced
  // was louder than the thing it was reporting.
  const rail = {
    OVERDUE: "var(--gl-state-blocked)", LAST_DAY: "var(--gl-state-blocked)",
    DUE_SOON: "var(--gl-state-warn)", SETTLED: "var(--gl-state-ready)",
    OK: "var(--gl-state-ready)", UNKNOWN: "var(--gl-state-idle)",
  }[clock.standing] ?? "var(--gl-state-idle)";

  const ink = {
    OVERDUE: "text-[color:var(--gl-state-blocked-ink)]",
    LAST_DAY: "text-[color:var(--gl-state-blocked-ink)]",
    DUE_SOON: "text-[color:var(--gl-state-warn-ink)]",
    SETTLED: "text-[color:var(--gl-state-ready-ink)]",
    OK: "text-[color:var(--gl-ink)]",
    UNKNOWN: "text-[color:var(--gl-ink-muted)]",
  }[clock.standing] ?? "text-[color:var(--gl-ink-muted)]";

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border border-[color:var(--gl-line)] bg-white p-4"
      style={{ borderLeft: `6px solid ${rail}` }}>
      <div>
        <div className="gl-label">{clock.label}</div>
        <div className={`mt-1 text-[19px] font-semibold ${ink}`}>{clock.summary}</div>
      </div>
      <div className="gl-caption text-right">
        {clock.freeDays === null ? "Free time not recorded" : `${clock.freeDays} free days`}
        {clock.lastFreeDay ? <div>Last free day {formatDay(clock.lastFreeDay)}</div> : null}
        {clock.chargeableDays > 0
          ? <div className="font-semibold text-[color:var(--gl-state-blocked-ink)]">{clock.chargeableDays} chargeable</div>
          : null}
      </div>
    </div>
  );
}

/**
 * §34.0. What the days already over are likely to cost.
 *
 * The third of the three numbers. A controller reading "4 days over" cannot
 * tell a nuisance from four figures, and the manager who cares about the
 * answer is not the person watching the countdown.
 *
 * Shown only once a clock is actually chargeable. A container inside its free
 * time gets no money line at all — putting "SGD 0.00" under a healthy
 * container is a figure that draws the eye to nothing.
 */
function ChargeLine({ charge }) {
  if (!charge || charge.chargeableDays === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border border-[color:var(--gl-line)] bg-white p-4"
      style={{ borderLeft: "6px solid var(--gl-state-blocked)" }}>
      <div>
        <div className="gl-label">Estimated charge</div>
        <div className="mt-1 text-[19px] font-semibold text-[color:var(--gl-state-blocked-ink)]">
          {charge.amount === null
            ? `${charge.chargeableDays} chargeable day${charge.chargeableDays === 1 ? "" : "s"}`
            : `${charge.currency} ${charge.amount.toFixed(2)}`}
        </div>
      </div>
      <div className="gl-caption text-right">
        {charge.amount === null
          ? "No daily rate on file — add one to see the figure"
          : <>
              {charge.chargeableDays} day{charge.chargeableDays === 1 ? "" : "s"} at {charge.currency} {charge.dailyRate.toFixed(2)}
              <div>Our estimate, not the carrier&rsquo;s invoice</div>
            </>}
      </div>
    </div>
  );
}

/** Every clock on a container, or a plain sentence when there are none. */
function FreeTimePanel({ container }) {
  const clocks = container?.freeTime ?? [];
  if (!clocks.length) {
    return (
      <p className="gl-body">
        No countdown yet. Confirm the carrier&rsquo;s free-time terms on the job and
        this will start counting.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      {clocks.map((clock) => <FreeTimeRow key={clock.label} clock={clock} />)}
      <ChargeLine charge={container?.charge} />
    </div>
  );
}


/**
 * §18. The words on screen, and the values the engine knows.
 *
 * The drawer has always spoken in the operator's language — "Empty Return",
 * "Import Delivery" — while the movement model uses the enum. Translating here
 * keeps both honest: the screen stays readable and the store stays typed.
 */
/**
 * How many documents go in one request, and how many in one go.
 *
 * Matched to the server's cap, which is measured: a notice takes between 12
 * and 93 seconds, documents read in parallel, and a chunk therefore costs its
 * slowest member. Five against a 300-second ceiling leaves about three times
 * the headroom on the worst document seen.
 *
 * The total is capped as well, so an operator who selects an entire folder is
 * told the number rather than discovering it through a request that never
 * comes back. Twenty is a morning's post; beyond that it is a mistake.
 */
const DOCUMENTS_PER_REQUEST = 5;
const MAX_DOCUMENTS_PER_BATCH = 20;

const MOVEMENT_TYPE_FOR = {
  "Import Delivery": "IMPORT_DELIVERY",
  "Empty Return": "EMPTY_RETURN",
  "Import to Carpark": "IMPORT_TO_CARPARK",
  "Carpark to Customer": "CARPARK_TO_CUSTOMER",
  "Empty Collection": "EMPTY_COLLECTION",
  "Direct Laden to Port": "DIRECT_LADEN_TO_PORT",
  "One-Way Loaded": "ONE_WAY_LOADED",
  "Carpark to Port": "CARPARK_TO_PORT",
};

const MOVEMENT_STATUS_FOR = {
  Pending: "PENDING",
  Planned: "SCHEDULED",
  Scheduled: "SCHEDULED",
  Assigned: "ASSIGNED",
  Collected: "COLLECTED",
  "In Transit": "IN_TRANSIT",
  Delivered: "DELIVERED",
  Completed: "COMPLETED",
  Cancelled: "CANCELLED",
};

const drawerInputClass = "mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[17px] font-medium text-slate-950 outline-none focus:border-[var(--gl-accent)] focus:outline focus:outline-4 focus:outline-offset-1 focus:outline-sky-600";

function DrawerField({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-[15px] font-normal text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-2 block gl-label">{hint}</span> : null}
    </label>
  );
}

function ChoiceGroup({ label, value, options, onChange }) {
  return (
    <fieldset>
      <legend className="text-[15px] font-normal text-slate-600">{label}</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={`min-h-14 rounded-md border px-4 py-3 text-left text-[17px] font-semibold focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${value === option.value ? "border-[var(--gl-accent)] bg-[var(--gl-accent)] text-white" : "border-slate-300 bg-white text-slate-800 hover:border-[var(--gl-accent)]"}`}>
            <span className="block">{option.label}</span>
            {option.note ? <span className={`mt-1 block text-[17px] font-medium ${value === option.value ? "text-sky-100" : "text-slate-600"}`}>{option.note}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function suggestedTripDraft(job) {
  const reference = nextTripReference(job.trips || []);
  if (job.type === "Import") {
    const needsReturn = (job.containers || []).every((container) => container.state === "Delivered");
    const targetContainer = job.containers?.find((container) => container.state !== "Delivered") || job.containers?.[0];
    return needsReturn ? {
      id: reference,
      type: "Empty Return",
      origin: job.deliveryAddress,
      destination: job.emptyYard || "Empty depot to confirm",
      status: "Pending",
      plannedDate: "",
      containerRef: job.containers?.[0]?.ref || "",
      containerNumber: job.containers?.[0]?.number || "",
    } : {
      id: reference,
      type: "Import Delivery",
      origin: job.terminal,
      destination: job.deliveryAddress,
      status: "Pending",
      plannedDate: "",
      containerRef: targetContainer?.ref || "",
      containerNumber: targetContainer?.number || "",
    };
  }

  const containers = jobContainers(job);
  const target = containers.find((container, index) => !activeTrips(job).some((trip) => movementMatchesContainer(trip, container, index, containers.length) && ["Direct Laden to Port", "One-Way Loaded", "Carpark to Port"].includes(trip.type))) || containers[0];
  const containerFields = { containerRef: target?.ref || "", containerNumber: target?.number || "" };
  const emptyExists = (job.trips || []).some((trip) => trip.type === "Empty Collection" && trip.status !== "Cancelled");
  if (!emptyExists) return { id: reference, type: "Empty Collection", origin: job.emptyYard, destination: target?.stuffingLocation || job.deliveryAddress, status: "Pending", plannedDate: "", ...containerFields };
  if (job.atCarparkSince) return { id: reference, type: "Carpark to Port", origin: CARPARK, destination: "PSA Tuas", status: "Pending", plannedDate: "", ...containerFields };
  if (job.transhipment === "not_available" && job.carparkRequested) return { id: reference, type: "One-Way Loaded", origin: target?.stuffingLocation || job.deliveryAddress, destination: CARPARK, status: "Pending", plannedDate: "", ...containerFields };
  return { id: reference, type: "Direct Laden to Port", origin: target?.stuffingLocation || job.deliveryAddress, destination: "PSA Tuas", status: "Pending", plannedDate: "", ...containerFields };
}

function initialDrawerDraft(panel, job) {
  if (!panel) return {};
  if (panel.type === "job" && job) return {
    customer: job.customer || "",
    booking: job.booking || "",
    vessel: job.vessel || "",
    deliveryAddress: job.deliveryAddress || "",
    operatingLocation: job.type === "Import" ? job.terminal || "" : job.emptyYard || "",
  };
  if (panel.type === "checkpoint" && job) return {
    value: panel.key === "transhipment" ? job.transhipment || "pending" : panel.key === "deliveryPath" ? (job.carparkRequested ? "carpark" : "other") : Boolean(job[panel.key]),
  };
  if (panel.type === "container" && job?.type === "Export") {
    if (panel.mode === "new") return { number: "", seal: "", tareKg: "", vgmKg: "", sizeType: job.containerSizeType || "", stuffingLocation: job.deliveryAddress || "", detailsSent: false, customerReady: false };
    const container = jobContainers(job)[panel.index || 0];
    return {
      number: container.number || "",
      seal: container.seal || "",
      tareKg: container.tareKg ?? "",
      vgmKg: container.vgmKg ?? "",
      sizeType: container.sizeType || job.containerSizeType || "",
      stuffingLocation: container.stuffingLocation || job.deliveryAddress || "",
      detailsSent: Boolean(container.detailsSent),
      customerReady: Boolean(container.customerReady),
    };
  }
  if (panel.type === "container" && job?.type === "Import") {
    if (panel.mode === "new") return { number: "", type: "", seal: "", state: job.permitReceived ? "Ready" : "Awaiting permit", lastFreeDay: job.demurrageLastFreeDay || "" };
    const container = job.containers[panel.index || 0];
    return { number: container.number, type: container.type || "", seal: container.seal || "", state: container.state, lastFreeDay: container.lastFreeDay || job.demurrageLastFreeDay || "" };
  }
  if (panel.type === "trip" && job) {
    const trip = job.trips.find((item) => item.id === panel.tripId);
    return trip ? { ...trip } : suggestedTripDraft(job);
  }
  if (panel.type === "chassis") return { jobId: panel.jobId || "", action: panel.condition === "assigned" ? "release" : panel.condition === "maintenance" ? "return" : "assign" };
  if (panel.type === "freeTime" && job) {
    // §34 lives on the container: boxes on one job are discharged and returned
    // separately, so the terms are confirmed per container.
    const c = (job.containers ?? [])[0] ?? {};
    return {
      containerId: c.id ?? null,
      freeTimeModel: c.freeTimeModel && c.freeTimeModel !== "NOT_CONFIRMED" ? c.freeTimeModel : "SPLIT",
      demurrageFreeDays: "", demurrageLfd: "",
      detentionFreeDays: "", detentionLfd: "",
      combinedFreeDays: "", combinedLfd: "",
      freeTimeRemarks: c.freeTimeRemarks ?? "",
      dailyRate: c.dailyRate ?? "",
      currency: c.currency || "SGD",
    };
  }
  return {};
}

function panelHeading(panel, job) {
  const checkpointNames = {
    permitReceived: "Update permit",
    portnetReleased: "Update Portnet release",
    cmsCompleted: "Update CMS",
    detailsSent: "Update customer notification",
    customerReady: "Update customer readiness",
    transhipment: "Set transhipment",
    deliveryPath: "Set delivery path",
  };
  if (panel.type === "job") return { title: "Edit job information", note: "These facts drive readiness, location, and the next action." };
  if (panel.type === "checkpoint") return { title: checkpointNames[panel.key] || "Update checkpoint", note: "Saving this recalculates the job status and action queue." };
  if (panel.type === "container") return { title: panel.mode === "new" ? "Add container" : "Manage container", note: "Container progress and movements remain under the same job." };
  if (panel.type === "trip") return { title: panel.tripId ? `Update ${panel.tripId}` : "Create a trip", note: "Trip progress updates location, container state, and chassis availability." };
  if (panel.type === "chassis") return { title: `Chassis ${panel.unit}`, note: panel.condition === "available" ? "Assign this available unit to active work." : panel.condition === "maintenance" ? "Return this unit to the available fleet after inspection." : "Release this unit when the job no longer needs it." };
  if (panel.type === "freeTime") return { title: "Confirm free-time dates", note: "Confirmed dates replace provisional document-based estimates." };
  if (panel.type === "activity") return { title: "Job activity", note: "Every simulated operational change appears here." };
  if (panel.type === "source") return { title: "Extracted document facts", note: `${job?.sourceDocument?.fileName || "Arrival notice"} · processed on this device.` };
  return { title: "Manage work", note: "" };
}

function OperationsDrawer({ panel, jobs, onClose, onCommit }) {
  const job = jobs.find((item) => item.id === panel?.jobId);
  const [draft, setDraft] = useState(() => initialDrawerDraft(panel, job));
  const heading = panel ? panelHeading(panel, job) : { title: "", note: "" };

  // The drawer's draft is reset when it is pointed at a different panel. The
  // rule flags setState in an effect generically; here the effect is the
  // synchronisation, and the dependency list is the panel identity rather than
  // the objects themselves so a re-render does not discard typing in progress.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    setDraft(initialDrawerDraft(panel, job));
  }, [panel?.type, panel?.jobId, panel?.key, panel?.index, panel?.mode, panel?.tripId, panel?.unit]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!panel) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [panel, onClose]);

  if (!panel) return null;
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const activeJobs = jobs.filter((item) => jobStatus(item) !== "Completed");
  const isReadOnly = ["activity", "source"].includes(panel.type);
  const containerRecords = job ? jobContainers(job) : [];
  const draftContainerNumber = String(draft.number || "").toUpperCase().replace(/\s+/g, "");
  const duplicateContainerNumber = panel.type === "container" && draftContainerNumber && containerRecords.some((container, index) => index !== panel.index && String(container.number || "").toUpperCase().replace(/\s+/g, "") === draftContainerNumber);
  const selectedContainer = panel.type === "container" && panel.mode !== "new" ? containerRecords[panel.index || 0] : null;
  const selectedContainerHasMovement = selectedContainer ? (job?.trips || []).some((trip) => trip.status !== "Cancelled" && ((trip.containerRef && trip.containerRef === selectedContainer.ref) || (trip.containerNumber && trip.containerNumber === selectedContainer.number) || (!trip.containerRef && !trip.containerNumber && containerRecords.length === 1))) : false;
  const canRemoveContainer = panel.type === "container" && panel.mode !== "new" && containerRecords.length > 1 && !selectedContainerHasMovement;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-[color:var(--gl-ink-strong)]/25" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="operations-drawer-title" className="greenlit-drawer flex h-full w-full max-w-[680px] flex-col overflow-hidden border-l border-slate-300 bg-[#f4f6f8] shadow-[-20px_0_50px_rgba(15,35,51,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--gl-line)] bg-[var(--gl-bg-subtle)] px-5 py-5 text-[color:var(--gl-ink)]">
          <div className="min-w-0">
            <h2 id="operations-drawer-title" className="text-2xl font-semibold tracking-[-0.02em]">{heading.title}</h2>
            <p className="mt-2 text-[17px] font-medium text-[color:var(--gl-ink-muted)]">{heading.note}</p>
            {job ? <div className="gl-data gl-muted mt-2 inline-flex items-center">{job.id} · {job.customer}</div> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close management panel" className="flex min-h-11 min-w-9 shrink-0 items-center justify-center rounded-md text-[color:var(--gl-ink-muted)] hover:bg-[color:var(--gl-bg-hover)]"><X className="h-6 w-6" /></button>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); if (isReadOnly) onClose(); else onCommit(panel, draft); }} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {panel.type === "job" && job ? (
              <div className="grid gap-5">
                <DrawerField label="Customer"><input required value={draft.customer || ""} onChange={(event) => update("customer", event.target.value)} className={drawerInputClass} /></DrawerField>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DrawerField label="Booking / reference"><input value={draft.booking || ""} onChange={(event) => update("booking", event.target.value)} className={drawerInputClass} /></DrawerField>
                  <DrawerField label="Vessel / voyage"><input value={draft.vessel || ""} onChange={(event) => update("vessel", event.target.value)} className={drawerInputClass} /></DrawerField>
                </div>
                <DrawerField label={job.type === "Import" ? "Discharging terminal" : "Empty collection yard"}><input required value={draft.operatingLocation || ""} onChange={(event) => update("operatingLocation", event.target.value)} className={drawerInputClass} /></DrawerField>
                <DrawerField label="Customer delivery address"><textarea required rows={3} value={draft.deliveryAddress || ""} onChange={(event) => update("deliveryAddress", event.target.value)} className={drawerInputClass} /></DrawerField>
              </div>
            ) : null}

            {panel.type === "checkpoint" ? (
              panel.key === "transhipment" ? <ChoiceGroup label="Carrier response" value={draft.value} onChange={(value) => update("value", value)} options={[{ value: "available", label: "Available", note: "Plan a direct or final port trip." }, { value: "not_available", label: "Not available", note: "Choose another laden delivery path." }, { value: "pending", label: "Still pending", note: "Keep the job waiting on the carrier." }]} />
                : panel.key === "deliveryPath" ? <ChoiceGroup label="Agreed path" value={draft.value} onChange={(value) => update("value", value)} options={[{ value: "carpark", label: "Use company carpark", note: "Create the one-way loaded branch." }, { value: "other", label: "Another path needed", note: "Keep the job blocked for follow-up." }]} />
                  : <ChoiceGroup label="Checkpoint state" value={draft.value} onChange={(value) => update("value", value)} options={[{ value: true, label: "Complete / received", note: "Release this checkpoint." }, { value: false, label: "Outstanding", note: "Keep this checkpoint open." }]} />
            ) : null}

            {panel.type === "container" && job?.type === "Export" ? (
              <div className="grid gap-5">
                <div className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-4 py-3"><div><div className="gl-label">Container reference</div><div className="mt-1 text-xl font-semibold text-slate-950">{panel.mode === "new" ? `C${containerRecords.length + 1}` : selectedContainer?.ref || `C${(panel.index || 0) + 1}`}</div></div><div className="text-right text-[15px] font-medium text-slate-600">{containerRecords.length} on job</div></div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DrawerField label="Container number" hint="May remain blank until the empty is collected."><input maxLength={11} pattern="[A-Za-z]{4}[0-9]{7}" value={draft.number || ""} onChange={(event) => update("number", event.target.value)} className={drawerInputClass} /></DrawerField>
                  <DrawerField label="Size / type"><input required value={draft.sizeType || ""} onChange={(event) => update("sizeType", event.target.value)} className={drawerInputClass} placeholder="40 HQ" /></DrawerField>
                  <DrawerField label="Seal number"><input value={draft.seal || ""} onChange={(event) => update("seal", event.target.value)} className={drawerInputClass} /></DrawerField>
                  <DrawerField label="Tare weight (kg)"><input min="1" type="number" inputMode="numeric" value={draft.tareKg ?? ""} onChange={(event) => update("tareKg", event.target.value)} className={drawerInputClass} /></DrawerField>
                  <DrawerField label="VGM (kg)" hint="May remain blank until the customer provides it."><input min="1" type="number" inputMode="numeric" value={draft.vgmKg ?? ""} onChange={(event) => update("vgmKg", event.target.value)} className={drawerInputClass} /></DrawerField>
                </div>
                <DrawerField label="Stuffing location" hint="Each container may use a different customer site."><textarea required rows={2} value={draft.stuffingLocation || ""} onChange={(event) => update("stuffingLocation", event.target.value)} className={drawerInputClass} /></DrawerField>
                <ChoiceGroup label="Details sent to customer" value={Boolean(draft.detailsSent)} onChange={(value) => update("detailsSent", value)} options={[{ value: true, label: "Sent", note: "This container may proceed to stuffing." }, { value: false, label: "Not sent", note: "Keep this container waiting on us." }]} />
                <ChoiceGroup label="Customer confirms container ready" value={Boolean(draft.customerReady)} onChange={(value) => update("customerReady", value)} options={[{ value: true, label: "Ready", note: "Validate VGM before laden movement." }, { value: false, label: "Not ready", note: "Keep this container waiting on the customer." }]} />
                {duplicateContainerNumber ? <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-4 text-[17px] font-semibold text-rose-900">{draftContainerNumber} is already on this job. Every container number must be unique.</div> : null}
              </div>
            ) : null}

            {panel.type === "container" && job?.type === "Import" ? (
              <div className="grid gap-5">
                <DrawerField label="Container number"><input required maxLength={11} pattern="[A-Za-z]{4}[0-9]{7}" value={draft.number || ""} onChange={(event) => update("number", event.target.value)} className={drawerInputClass} /></DrawerField>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DrawerField label="Container type"><input value={draft.type || ""} onChange={(event) => update("type", event.target.value)} className={drawerInputClass} placeholder="20' General Purpose" /></DrawerField>
                  <DrawerField label="Seal number"><input value={draft.seal || ""} onChange={(event) => update("seal", event.target.value)} className={drawerInputClass} /></DrawerField>
                </div>
                <DrawerField label="Operational state"><select value={draft.state || ""} onChange={(event) => update("state", event.target.value)} className={drawerInputClass}>{["At terminal", "Awaiting permit", "Ready", "Collected", "Delivered"].map((state) => <option key={state}>{state}</option>)}</select></DrawerField>
                <DrawerField label="Container last free day"><input required type="date" value={draft.lastFreeDay || ""} onChange={(event) => update("lastFreeDay", event.target.value)} className={drawerInputClass} /></DrawerField>
                <div className="rounded-md border border-sky-200 bg-sky-50 p-4 text-[17px] font-medium text-sky-900">Marking a container collected or delivered also updates its linked delivery trip. Delivering every container creates the empty-return trip automatically.</div>
                {duplicateContainerNumber ? <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-4 text-[17px] font-semibold text-rose-900">{draftContainerNumber} is already on this job. Every container number must be unique.</div> : null}
              </div>
            ) : null}

            {panel.type === "container" && panel.mode !== "new" && selectedContainerHasMovement && containerRecords.length > 1 ? (
              <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-[17px] font-medium text-amber-950">This container has a linked movement, so it cannot be removed from the job. Cancel or resolve that movement first.</div>
            ) : null}

            {panel.type === "trip" && job ? (
              <div className="grid gap-5">
                <div className="rounded-md border border-slate-200 bg-white px-4 py-3"><div className="gl-label">Trip reference</div><div className="mt-1 text-xl font-semibold text-slate-950">{draft.id || nextTripReference(job.trips)}</div></div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DrawerField label="Trip type"><select value={draft.type || ""} onChange={(event) => update("type", event.target.value)} className={drawerInputClass}>{(job.type === "Import" ? ["Import Delivery", "Empty Return"] : ["Empty Collection", "Direct Laden to Port", "One-Way Loaded", "Carpark to Port"]).map((type) => <option key={type}>{type}</option>)}</select></DrawerField>
                  <DrawerField label="Status"><select value={draft.status || "Pending"} onChange={(event) => update("status", event.target.value)} className={drawerInputClass}>{["Pending", "Collected", "In Transit", "Delivered", "Completed", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select></DrawerField>
                </div>
                {(job.type === "Import" && draft.type === "Import Delivery") || (job.type === "Export" && draft.type !== "Empty Return") ? <DrawerField label="Container"><select value={draft.containerRef || draft.containerNumber || ""} onChange={(event) => { const container = jobContainers(job).find((item) => item.ref === event.target.value || item.number === event.target.value); update("containerRef", container?.ref || ""); update("containerNumber", container?.number || ""); }} className={drawerInputClass}>{jobContainers(job).map((container) => <option key={container.ref || container.number} value={container.ref || container.number}>{container.ref ? `${container.ref} · ` : ""}{container.number || "Identity pending"}{container.state ? ` · ${container.state}` : ""}</option>)}</select></DrawerField> : null}
                {/* From and To, not one "route" string. The movement has an
                    origin and a destination, and joining them with an arrow
                    meant the screen held something the store could not. */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <DrawerField label="From"><input required value={draft.origin || ""} onChange={(event) => update("origin", event.target.value)} className={drawerInputClass} placeholder="PSA Pasir Panjang" /></DrawerField>
                  <DrawerField label="To"><input required value={draft.destination || ""} onChange={(event) => update("destination", event.target.value)} className={drawerInputClass} placeholder="47 Jalan Buroh" /></DrawerField>
                </div>
                <DrawerField label="Planned date" hint="Leave blank if the transport desk has not scheduled it."><input type="date" value={draft.plannedDate || ""} onChange={(event) => update("plannedDate", event.target.value)} className={drawerInputClass} /></DrawerField>
                {draft.status === "Cancelled" ? <DrawerField label="Cancellation reason"><textarea required rows={3} value={draft.cancelledReason || ""} onChange={(event) => update("cancelledReason", event.target.value)} className={drawerInputClass} /></DrawerField> : null}
              </div>
            ) : null}

            {panel.type === "chassis" ? (
              <div className="grid gap-5">
                <div className="grid grid-cols-2 gap-4 rounded-md border border-slate-200 bg-white p-5"><div><div className="gl-label">Unit</div><div className="mt-1 text-3xl font-semibold text-slate-950">{panel.unit}</div></div><div><div className="gl-label">Size</div><div className="mt-1 text-xl font-semibold text-slate-950">{panel.size}</div></div></div>
                {panel.condition === "available" ? <DrawerField label="Assign to active job"><select required value={draft.jobId || ""} onChange={(event) => update("jobId", event.target.value)} className={drawerInputClass}><option value="">Choose a job</option>{activeJobs.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.customer}</option>)}</select></DrawerField> : null}
                {panel.condition === "assigned" ? <ChoiceGroup label="Chassis action" value={draft.action} onChange={(value) => update("action", value)} options={[{ value: "release", label: "Release to fleet", note: "Make the unit available immediately." }, { value: "keep", label: "Keep assigned", note: "Leave the current assignment unchanged." }]} /> : null}
                {panel.condition === "maintenance" ? <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-[17px] font-medium text-amber-950">This simulates completing the inspection and returning the unit to the available register.</div> : null}
              </div>
            ) : null}

            {panel.type === "freeTime" ? (
              <div className="grid gap-5">
                {/* §34.3. The model chooses the fields. Asking for a demurrage
                    and a detention date regardless of what the carrier issues
                    is how a combined allowance ends up shown as two
                    countdowns, which is the deadline that does not exist
                    sitting beside the one that does. */}
                <DrawerField label="What the carrier gives">
                  <select
                    value={draft.freeTimeModel || "SPLIT"}
                    onChange={(event) => setDraft((d) => ({ ...d, freeTimeModel: event.target.value }))}
                    className={drawerInputClass}
                  >
                    <option value="SPLIT">Separate demurrage and detention</option>
                    <option value="COMBINED">One combined D&amp;D allowance</option>
                    <option value="NOT_CONFIRMED">Not confirmed yet</option>
                  </select>
                </DrawerField>

                {draft.freeTimeModel === "COMBINED" ? (
                  <>
                    <DrawerField label="Combined free days">
                      <input type="number" min="0" value={draft.combinedFreeDays || ""}
                        onChange={(event) => setDraft((d) => ({ ...d, combinedFreeDays: event.target.value }))}
                        className={drawerInputClass} />
                    </DrawerField>
                    <DrawerField label="Last free day">
                      <input type="date" value={draft.combinedLfd || ""}
                        onChange={(event) => setDraft((d) => ({ ...d, combinedLfd: event.target.value }))}
                        className={drawerInputClass} />
                    </DrawerField>
                  </>
                ) : null}

                {(draft.freeTimeModel || "SPLIT") === "SPLIT" ? (
                  <>
                    <DrawerField label="Demurrage free days">
                      <input type="number" min="0" value={draft.demurrageFreeDays || ""}
                        onChange={(event) => setDraft((d) => ({ ...d, demurrageFreeDays: event.target.value }))}
                        className={drawerInputClass} />
                    </DrawerField>
                    <DrawerField label="Demurrage last free day">
                      <input type="date" value={draft.demurrageLfd || ""}
                        onChange={(event) => setDraft((d) => ({ ...d, demurrageLfd: event.target.value }))}
                        className={drawerInputClass} />
                    </DrawerField>
                    <DrawerField label="Detention free days">
                      <input type="number" min="0" value={draft.detentionFreeDays || ""}
                        onChange={(event) => setDraft((d) => ({ ...d, detentionFreeDays: event.target.value }))}
                        className={drawerInputClass} />
                    </DrawerField>
                    <DrawerField label="Detention last free day">
                      <input type="date" value={draft.detentionLfd || ""}
                        onChange={(event) => setDraft((d) => ({ ...d, detentionLfd: event.target.value }))}
                        className={drawerInputClass} />
                    </DrawerField>
                  </>
                ) : null}

                {draft.freeTimeModel === "NOT_CONFIRMED" ? (
                  <p className="gl-body">
                    No countdown is shown until the terms are confirmed. A deadline
                    derived from an unchecked carrier rule is worse than none,
                    because it will be trusted.
                  </p>
                ) : null}

                <DrawerField label="Free-time remarks">
                  <input value={draft.freeTimeRemarks || ""}
                    onChange={(event) => setDraft((d) => ({ ...d, freeTimeRemarks: event.target.value }))}
                    placeholder="e.g. 10 combined calendar days from discharge"
                    className={drawerInputClass} />
                </DrawerField>

                {/* §34.0. The rate turns days into money, and it is read off
                    the same tariff page as the allowance above, so it is
                    confirmed in the same breath. Both boxes or neither: a rate
                    with no currency is an amount nobody can quote. */}
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <DrawerField label="Daily rate after free time">
                    <input type="number" min="0" step="0.01" inputMode="decimal"
                      value={draft.dailyRate ?? ""}
                      onChange={(event) => setDraft((d) => ({ ...d, dailyRate: event.target.value }))}
                      placeholder="e.g. 85.00"
                      className={drawerInputClass} />
                  </DrawerField>
                  <DrawerField label="Currency">
                    <select value={draft.currency || "SGD"}
                      onChange={(event) => setDraft((d) => ({ ...d, currency: event.target.value }))}
                      className={drawerInputClass}>
                      {["SGD", "USD", "EUR", "CNY", "MYR"].map((code) => <option key={code} value={code}>{code}</option>)}
                    </select>
                  </DrawerField>
                </div>
                <p className="gl-caption -mt-2">
                  Leave the rate blank if the tariff is not to hand. The countdowns
                  do not depend on it; only the estimated charge does.
                </p>
              </div>
            ) : null}

            {panel.type === "activity" ? (
              <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {(job?.activity || []).length ? job.activity.map((item) => <div key={item.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-950">{item.text}</span><span className="gl-label">{item.at}</span></div><div className="mt-2 text-[15px] font-normal text-slate-600">{item.actor}</div></div>) : <div className="p-6 text-center"><History className="mx-auto h-11 w-9 text-slate-600" /><div className="mt-3 text-xl font-semibold text-slate-950">No simulated changes yet</div><div className="mt-2 text-[17px] text-slate-600">Updates made from checkpoints, containers, trips, or chassis will appear here.</div></div>}
              </div>
            ) : null}

            {panel.type === "source" ? (
              <div className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2">
                {Object.entries(job?.sourceDocument?.values || { "Document type": job?.sourceDocument?.documentType, Carrier: job?.sourceDocument?.carrier, "Issue date": job?.sourceDocument?.issueDate, "Bill of lading": job?.billOfLading, "Vessel / voyage": [job?.vessel, job?.voyage].filter(Boolean).join(" / ") }).filter(([, value]) => value).map(([key, value]) => <div key={key} className="min-w-0 bg-white p-4"><div className="text-[17px] font-semibold capitalize text-slate-600">{String(key).replace(/([A-Z])/g, " $1")}</div><div className="mt-2 break-words text-[17px] font-semibold text-slate-950">{String(value)}</div></div>)}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onClose} className="min-h-12 rounded-md border border-slate-300 bg-white px-5 text-[17px] font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{isReadOnly ? "Close" : "Cancel"}</button>
              {canRemoveContainer ? <button type="button" onClick={() => onCommit(panel, { ...draft, _delete: true })} className="inline-flex min-h-12 items-center gap-2 rounded-md border border-rose-300 bg-white px-4 text-[17px] font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600"><Trash2 className="h-5 w-5" />Remove</button> : null}
            </div>
            {!isReadOnly ? <button type="submit" disabled={Boolean(duplicateContainerNumber)} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-[var(--gl-accent)] px-6 py-3 text-[17px] font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-slate-400"><Save className="h-5 w-5" />{panel.type === "container" && panel.mode === "new" ? "Add container" : "Save and recalculate"}</button> : null}
          </div>
        </form>
      </aside>
    </div>
  );
}




/**
 * Maps the server's fleet view into the shape the fleet screen consumes.
 *
 * Every status here was derived by @greenlit/engine from job records (§35.3),
 * not typed and not invented locally — which is why this function only
 * reshapes and never decides anything.
 */
function fleetFromApi(view) {
  const rows = (view?.units ?? []).map((u) => ({
    unit: u.chassisNo,
    size: u.size === '20FT' ? '20ft' : '40ft',
    status: u.status,
    plate: u.plateNo,
    jobId: u.jobNumber,
    customer: u.customer,
    heldSince: u.heldSince,
    days: u.daysHeld,
    inspectionDue: u.inspectionDueDate,
  }));
  return {
    inUse: rows.filter((r) => r.status === 'IN_USE'),
    available: rows.filter((r) => r.status === 'AVAILABLE'),
    maintenance: rows.filter((r) => r.status === 'MAINTENANCE' || r.status === 'INSPECTION'),
    availability: view?.availability ?? null,
    averageJobDays: view?.averageJobDays ?? null,
    monthlyCapacity20ft: view?.monthlyCapacity20ft ?? null,
    monthlyCapacity40ft: view?.monthlyCapacity40ft ?? null,
    // §21.3.2. Trucks, not chassis — a different and more expensive capacity.
    vehicles: view?.vehicles ?? [],
    vehicleClashes: view?.vehicleClashes ?? [],
  };
}

const EMPTY_FLEET = { inUse: [], available: [], maintenance: [], availability: null,
  averageJobDays: null, monthlyCapacity20ft: null, monthlyCapacity40ft: null,
  vehicles: [], vehicleClashes: [] };

/** §35. Reads the fleet from the server, where its status is derived. */
function useFleet() {
  const [fleet, setFleet] = useState(EMPTY_FLEET);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/fleet")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (!cancelled) setFleet(fleetFromApi(data.fleet)); })
      .catch(() => { if (!cancelled) setFleet(EMPTY_FLEET); });
    return () => { cancelled = true; };
  }, []);
  return fleet;
}


/**
 * What a field's badge says, and how loudly.
 *
 * An absent field is not automatically a problem. Most documents carry no
 * booking number, and marking that "Missing" in red said the job could not
 * proceed when it could: red is reserved for the fields that genuinely block
 * applying, and everything else reads as information.
 *
 * The distinction is REQUIRED_JOB_FIELDS, which is the same list that decides
 * whether the Apply button is disabled — so the badge cannot disagree with the
 * button, which is how it came to be wrong in the first place.
 */
function documentFieldBadge(level, required) {
  if (level === "high") {
    return { text: "Extracted", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  if (level === "edited") {
    return { text: "Edited", tone: "border-sky-200 bg-sky-50 text-sky-800" };
  }
  if (level === "review") {
    return { text: "Check this", tone: "border-amber-200 bg-amber-50 text-amber-900" };
  }
  return required
    ? { text: "Needed", tone: "border-rose-200 bg-rose-50 text-rose-900" }
    : { text: "Not on document", tone: "border-slate-300 bg-slate-100 text-slate-700" };
}

/**
 * §34. Free-time terms, shown according to the carrier's model.
 *
 * A carrier issues either two allowances or one, and the two shapes are not
 * interchangeable. Offering all three numbers at once invites a container
 * recorded as demurrage 5, detention 7 and combined 14 — three figures
 * describing two different allowances, with nothing to say afterwards which
 * the carrier actually gave. §34.3 is explicit that splitting a single
 * allowance in two "invents a deadline that does not exist and hides the one
 * that does", so the model chooses the fields rather than sitting beside them.
 *
 * Clearing the fields that no longer apply is deliberate: leaving them would
 * store the contradiction this exists to prevent, just out of sight.
 */
function FreeTimeFields({ draft, confidence, onChange }) {
  const model = draft.freeTimeModel || "NOT_CONFIRMED";

  function selectModel(next) {
    onChange("freeTimeModel", next);
    if (next !== "SPLIT") {
      onChange("demurrageFreeDays", "");
      onChange("detentionFreeDays", "");
    }
    if (next !== "COMBINED") onChange("combinedFreeDays", "");
  }

  return (
    <>
      <div className="border-b border-slate-200 p-5 md:col-span-2">
        <label className="flex flex-col gap-2">
          <span className="text-[17px] font-semibold text-slate-950">Free-time type</span>
          <span className="text-[15px] text-slate-700">
            What the carrier issues. Read from the document where it says so, and confirmed here.
          </span>
          <select value={model} onChange={(event) => selectModel(event.target.value)}
            className="mt-1 h-12 max-w-[420px] rounded-md border border-slate-400 px-3 text-[17px] text-slate-950">
            {FREE_TIME_MODELS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {model === "SPLIT" ? (
        <>
          <DocumentField field={{ key: "demurrageFreeDays", label: "Demurrage-free days", inputMode: "numeric" }}
            value={draft.demurrageFreeDays} confidence={confidence.demurrageFreeDays} onChange={onChange} />
          <DocumentField field={{ key: "detentionFreeDays", label: "Detention-free days", inputMode: "numeric" }}
            value={draft.detentionFreeDays} confidence={confidence.detentionFreeDays} onChange={onChange} />
        </>
      ) : null}

      {model === "COMBINED" ? (
        <DocumentField field={{ key: "combinedFreeDays", label: "Combined D&D days", inputMode: "numeric" }}
          value={draft.combinedFreeDays} confidence={confidence.combinedFreeDays} onChange={onChange} />
      ) : null}

      {model === "NOT_CONFIRMED" ? (
        <div className="p-5 text-[17px] text-slate-700 md:col-span-2">
          No countdown is shown until the type is confirmed. A deadline derived from
          an unchecked carrier rule is worse than none, because it will be trusted.
        </div>
      ) : null}

      <DocumentField field={{ key: "freeTimeRemarks", label: "Free-time remarks", multiline: true }}
        value={draft.freeTimeRemarks} confidence={confidence.freeTimeRemarks} onChange={onChange} />
    </>
  );
}

function DocumentField({ field, value, confidence, onChange }) {
  // Required is the field's own flag, which is derived from the same list the
  // Apply button checks.
  const required = isRequiredField(field.key);
  const badge = documentFieldBadge(confidence, required);
  return (
    <label className={`block px-5 py-4 ${field.multiline ? "md:col-span-2" : ""}`}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[15px] font-normal text-slate-600">{field.label}{required ? " *" : ""}</span>
        <span className={`inline-flex min-h-7 items-center rounded-full border px-2 text-[15px] font-semibold ${badge.tone}`}>{badge.text}</span>
      </span>
      {field.multiline ? (
        <textarea
          required={required}
          value={value || ""}
          onChange={(event) => onChange(field.key, event.target.value)}
          rows={3}
          className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[17px] font-medium text-slate-950 outline-none placeholder:text-slate-600 focus:border-[var(--gl-accent)] focus:outline focus:outline-4 focus:outline-offset-1 focus:outline-sky-600"
        />
      ) : (
        <input
          required={required}
          type={field.type || "text"}
          inputMode={field.inputMode}
          value={value || ""}
          onChange={(event) => onChange(field.key, event.target.value)}
          className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[17px] font-medium text-slate-950 outline-none placeholder:text-slate-600 focus:border-[var(--gl-accent)] focus:outline focus:outline-4 focus:outline-offset-1 focus:outline-sky-600"
        />
      )}
    </label>
  );
}

function normaliseDocumentContainers(containers) {
  return containers.map((container, index) => ({
    ...container,
    ref: `C${index + 1}`,
    number: String(container.number || "").toUpperCase().replace(/\s+/g, ""),
    type: String(container.type || "").trim(),
    seal: String(container.seal || "").trim().toUpperCase(),
  }));
}

function documentContainerIssues(containers) {
  const normalised = normaliseDocumentContainers(containers);
  return normalised.map((container, index) => {
    if (!container.number) return "Enter a container number.";
    if (!/^[A-Z]{4}[0-9]{7}$/.test(container.number)) return "Use four letters followed by seven digits.";
    if (normalised.some((other, otherIndex) => otherIndex !== index && other.number === container.number)) return "This container number appears more than once.";
    return "";
  });
}

function DocumentContainersEditor({ containers, onChange }) {
  const issues = documentContainerIssues(containers);
  // Asked of the engine rather than restated here, so the wording a controller
  // reads before applying is the wording the server would refuse with. A
  // notice listing more than the limit loads all of its rows; the editor only
  // stops you adding more, which is no warning at all for a document that
  // arrived over the line.
  const countIssue = validateContainerCount(containers.length).reason;
  const update = (index, key, value) => onChange(containers.map((container, containerIndex) => containerIndex === index ? { ...container, [key]: value } : container));
  const add = () => {
    onChange([...containers, { id: `manual-container-${Date.now()}`, ref: `C${containers.length + 1}`, number: "", type: "", seal: "" }]);
  };
  const remove = (index) => {
    if (containers.length <= 1) return;
    onChange(containers.filter((_, containerIndex) => containerIndex !== index).map((container, containerIndex) => ({ ...container, ref: `C${containerIndex + 1}` })));
  };

  return (
    <fieldset>
      <legend className="w-full bg-slate-100 px-5 py-3 text-[17px] font-semibold text-slate-950">Containers</legend>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div><div className="text-[17px] font-semibold text-slate-950">{containers.length} container{containers.length === 1 ? "" : "s"} found</div><div className="mt-1 text-[15px] font-normal text-slate-600">Review each unit independently.</div></div>
        <button type="button" onClick={add} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 font-semibold text-[var(--gl-accent)] hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:border-sky-200 disabled:bg-sky-50 disabled:text-sky-800"><Plus className="h-5 w-5" />Add container</button>
      </div>
      {countIssue ? (
        <div role="alert" className="border-b border-rose-300 bg-rose-50 px-5 py-4 text-[17px] font-medium text-rose-900">
          {countIssue}
        </div>
      ) : null}

      <div className="divide-y divide-slate-200">
        {containers.map((container, index) => (
          <div key={container.id || `${container.ref}-${index}`} className="px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3"><span className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-slate-100 px-3 font-semibold text-slate-800">C{index + 1}</span><span className="text-[15px] font-medium text-slate-600">{container.id?.startsWith("manual-") ? "Added for review" : "Extracted from PDF"}</span></div>
              <button type="button" onClick={() => remove(index)} disabled={containers.length <= 1} className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold text-rose-800 underline underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600 disabled:text-slate-600 disabled:no-underline"><Trash2 className="h-5 w-5" />Remove</button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label><span className="text-[15px] font-normal text-slate-600">Container number *</span><input required maxLength={11} pattern="[A-Za-z]{4}[0-9]{7}" value={container.number || ""} onChange={(event) => update(index, "number", event.target.value)} className={drawerInputClass} /></label>
              <label><span className="text-[15px] font-normal text-slate-600">Container type</span><input value={container.type || ""} onChange={(event) => update(index, "type", event.target.value)} className={drawerInputClass} /></label>
              <label><span className="text-[15px] font-normal text-slate-600">Seal number</span><input value={container.seal || ""} onChange={(event) => update(index, "seal", event.target.value)} className={drawerInputClass} /></label>
              <label><span className="text-[15px] font-normal text-slate-600">Gross weight (kg)</span><input inputMode="numeric" value={container.grossWeight || ""} onChange={(event) => update(index, "grossWeight", event.target.value)} className={drawerInputClass} /></label>
              <label><span className="text-[15px] font-normal text-slate-600">Packages</span><input inputMode="numeric" value={container.packageCount || ""} onChange={(event) => update(index, "packageCount", event.target.value)} className={drawerInputClass} /></label>
              <label><span className="text-[15px] font-normal text-slate-600">Package type</span><input value={container.packageType || ""} onChange={(event) => update(index, "packageType", event.target.value)} className={drawerInputClass} /></label>
            </div>
            {issues[index] ? <div role="alert" className="mt-3 text-[17px] font-semibold text-rose-800">{issues[index]}</div> : null}
          </div>
        ))}
      </div>
    </fieldset>
  );
}


/**
 * §12 discrepancy review.
 *
 * "The controller decides which value becomes current, and that decision is
 * audited." Until one is chosen, the stored value stays in place — so this
 * panel is the only route by which an extracted value reaches a critical field
 * that already had one.
 */
function DiscrepancyReview({ job, onResolve }) {
  const open = (job.discrepancies || []).filter((d) => !d.resolvedAt);
  if (!open.length) return null;

  return (
    <section className="gl-panel mt-6 border-amber-300">
      <div className="gl-panel__header bg-amber-50">
        <h2 className="gl-title text-amber-900">
          {open.length} document {open.length === 1 ? "conflict" : "conflicts"} need a decision
        </h2>
        <span className="gl-caption">Stored values are unchanged until you choose</span>
      </div>
      <div className="divide-y divide-slate-200">
        {open.map((d) => (
          <div key={`${d.field}-${d.detectedAt}`} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <div className="gl-label">{d.field}</div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="gl-data gl-strong">{String(d.storedValue ?? "—")}</span>
                <span className="gl-caption">currently stored</span>
                <span className="gl-caption">vs</span>
                <span className="gl-data">{String(d.extractedValue ?? "—")}</span>
                <span className="gl-caption">
                  from {d.source}{typeof d.confidence === "number" ? ` · ${Math.round(d.confidence * 100)}% confidence` : ""}
                </span>
              </div>
              <p className="gl-body gl-muted mt-1">{d.reason}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onResolve(d, "stored")}
                className="h-11 rounded border border-slate-300 bg-white px-3 text-[17px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Keep stored
              </button>
              <button
                type="button"
                onClick={() => onResolve(d, "extracted")}
                className="h-11 rounded border-0 bg-[color:var(--gl-accent)] px-3 text-[17px] font-medium text-white hover:bg-[color:var(--gl-accent-hover)]"
              >
                Use extracted
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DocumentIntake({ documents, onApply, onApplyBatch, onOpenJob }) {
  // §9. The companies a batch is grouped against. Loaded here because
  // grouping happens before anything is applied — the operator sees where
  // twenty notices are going before any of them becomes a job.
  const [customers, setCustomers] = useState([]);
  const [applyingBatch, setApplyingBatch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : { customers: [] }))
      .then((d) => { if (!cancelled) setCustomers(d.customers ?? []); })
      .catch(() => { if (!cancelled) setCustomers([]); });
    return () => { cancelled = true; };
  }, []);

  async function applyBatch(groups) {
    setApplyingBatch(true);
    // One at a time rather than at once. Job numbers are issued atomically now
    // so concurrency would be safe, but a failure halfway through a batch is
    // far easier to report when the order is known.
    let created = 0;
    for (const group of groups) {
      for (const item of group.documents) {
        const ok = await onApplyBatch(item.result, group.customer.code);
        if (ok) created += 1;
      }
    }
    setApplyingBatch(false);
    setBatch([]);
    setStage("idle");
    return created;
  }

  const [stage, setStage] = useState("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [draft, setDraft] = useState({});
  const [confidence, setConfidence] = useState({});
  const [containerDrafts, setContainerDrafts] = useState([]);
  const [error, setError] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  // §9. A morning's post: one row per document, resolving as each is read.
  const [batch, setBatch] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  async function acceptFile(file) {
    setError("");
    setProgress("Preparing the document");
    setStage("processing");
    let nextUrl = "";
    try {
      nextUrl = URL.createObjectURL(file);
      setProgress("Reading the document");

      // Server-side, because the reading happens there. The browser parser
      // this replaced matched one carrier's layout against selectable text,
      // so a scan or any other line failed at the door.
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/extract", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? `Could not read this document (HTTP ${response.status}).`);
      }

      const parsed = toIntakeResult(payload);
      setProgress("");
      // §10. The File itself, not only its name. Extraction records which
      // page and line every value came from and the file was then dropped, so
      // a controller in a demurrage dispute had a quote and nothing to check
      // it against.
      setResult({ ...parsed, fileName: file.name, fileSize: file.size, file });
      setDraft(parsed.values);
      setConfidence(parsed.confidence);
      setContainerDrafts(parsed.containers.length ? parsed.containers : [{ id: "container-1", ref: "C1", number: "", type: "", seal: "" }]);
      setSourceUrl(nextUrl);
      setStage("review");
    } catch (problem) {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      setError(problem instanceof Error ? problem.message : "Greenlit could not read this document.");
      setProgress("");
      setStage("error");
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    acceptFiles([...(event.dataTransfer.files ?? [])]);
  }

  /**
   * One document or a morning's post.
   *
   * A single file keeps the review screen it has always had, because reading
   * one notice and checking it is the common case and a list of one is a worse
   * way to do it. Several go to the batch screen, where the question is not
   * "is this field right" but "do these twenty belong where I think they do".
   */
  function acceptFiles(files) {
    const chosen = files.filter(Boolean);
    if (chosen.length === 0) return;

    // Said before anything is read, with the number, so selecting a folder by
    // accident costs a sentence rather than four minutes and a failure.
    if (chosen.length > MAX_DOCUMENTS_PER_BATCH) {
      setError(
        `${chosen.length} documents at once is more than this reads in one go. `
        + `Take up to ${MAX_DOCUMENTS_PER_BATCH} — about a morning's post — and the rest after.`,
      );
      setStage("error");
      return;
    }

    if (chosen.length === 1) { acceptFile(chosen[0]); return; }
    acceptBatch(chosen);
  }

  async function acceptBatch(files) {
    setError("");
    setStage("batch");
    // Named before they are read, so the operator watches twenty rows resolve
    // rather than a spinner that says nothing for four minutes.
    setBatch(files.map((file) => ({ fileName: file.name, file, state: "reading" })));

    // Sent in chunks, because a request has a time limit and a document takes
    // about twenty-five seconds. Four together finish inside it; twenty in one
    // request is a gateway timeout, which reads to the operator as the whole
    // batch failing rather than as it being too big.
    //
    // Chunks go one after another so each row resolves visibly. It is no
    // slower than the limit allows, and a morning's post shows its progress
    // instead of a spinner that says nothing for four minutes.
    for (let from = 0; from < files.length; from += DOCUMENTS_PER_REQUEST) {
      const chunk = files.slice(from, from + DOCUMENTS_PER_REQUEST);
      const body = new FormData();
      for (const file of chunk) body.append("file", file);

      const response = await fetch("/api/extract", { method: "POST", body }).catch(() => null);
      const payload = await response?.json().catch(() => ({}));

      if (!response?.ok) {
        // This chunk failed; the ones already read are kept. Losing four
        // documents is better than losing twenty.
        setBatch((current) => current.map((item) => chunk.some((f) => f.name === item.fileName)
          ? { ...item, state: "failed", error: payload?.error ?? "Could not be read" }
          : item));
        continue;
      }

      const byName = new Map((payload.documents ?? [payload]).map((d) => [d.fileName, d]));
      setBatch((current) => current.map((item) => {
        if (!chunk.some((f) => f.name === item.fileName)) return item;
        const read = byName.get(item.fileName);
        if (!read || read.error) {
          return { ...item, state: "failed", error: read?.error ?? "Not read" };
        }
        return { ...item, state: "read", result: toIntakeResult(read) };
      }));
    }
  }

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setConfidence((current) => ({ ...current, [key]: "edited" }));
  }

  function resetIntake() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl("");
    setStage("idle");
    setResult(null);
    setDraft({});
    setConfidence({});
    setContainerDrafts([]);
    setError("");
    setProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const normalisedContainers = normaliseDocumentContainers(containerDrafts);
  const containerIssues = documentContainerIssues(containerDrafts);
  const effectiveDraft = { ...draft, containerNumber: normalisedContainers[0]?.number || "", containerType: normalisedContainers[0]?.type || "", sealNumber: normalisedContainers[0]?.seal || "" };
  const requiredMissing = REQUIRED_JOB_FIELDS.filter((key) => !String(effectiveDraft[key] || "").trim());
  const planningDemurrage = addIsoDays(draft.eta, Number(draft.demurrageFreeDays || 3));
  const planningDetention = addIsoDays(draft.eta, Number(draft.demurrageFreeDays || 3) + Number(draft.detentionFreeDays || 4));
  const reviewCount = Object.values(confidence).filter((level) => level === "review").length;

  return (
    <main id="main-content" className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">Document intake</h1>
          <p className="mt-2 max-w-[72ch] text-[17px] font-normal text-slate-600">Turn a carrier document into verified job facts before anything enters the control tower.</p>
        </div>
        <div className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-4 text-[17px] font-normal text-slate-700">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          Read on Greenlit&rsquo;s server, not stored
        </div>
      </div>

      {stage === "batch" ? (
        <BatchReview
          batch={batch}
          customers={customers}
          applying={applyingBatch}
          onDiscard={() => { setBatch([]); setStage("idle"); }}
          onApplyAll={applyBatch}
        />
      ) : null}

      {stage === "processing" ? (
        <section className="mt-7 flex min-h-80 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-12 text-center" aria-live="polite">
          <LoaderCircle className="h-12 w-12 animate-spin text-[var(--gl-accent)]" aria-hidden="true" />
          <h2 className="mt-5 text-2xl font-semibold text-slate-950">Reading the arrival notice</h2>
          <p className="mt-2 text-[17px] font-semibold text-[var(--gl-accent)]">{progress || "Preparing the document"}</p>
          <p className="mt-2 max-w-[58ch] text-[17px] text-slate-600">Greenlit is finding shipment, party, container, cargo and free-time facts. The file remains in this browser.</p>
        </section>
      ) : null}

      {(stage === "idle" || stage === "error") ? (
        <section className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="upload-document-title">
          <div className="border-b border-slate-200 bg-[var(--gl-bg-subtle)] px-5 py-4 text-[color:var(--gl-ink)]">
            <h2 id="upload-document-title" className="text-xl font-semibold">Upload an arrival notice</h2>
          </div>
          <div className="p-5 sm:p-8">
            {error ? (
              <div role="alert" className="mb-5 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-[17px] font-medium text-rose-900">
                <AlertCircle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
                <div><div className="font-semibold">The PDF was not applied.</div><div className="mt-1">{error}</div></div>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf,.pdf,image/*,.eml,.msg"
              className="hidden"
              onChange={(event) => {
                acceptFiles([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
            <div
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex min-h-72 flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center ${dragging ? "border-[var(--gl-accent)] bg-sky-50" : "border-slate-300 bg-slate-50"}`}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-md bg-[var(--gl-accent)] text-white"><Upload className="h-7 w-7" aria-hidden="true" /></span>
              <span className="mt-5 text-2xl font-semibold text-slate-950">Drop documents here</span>
              <span className="mt-2 max-w-[58ch] text-[17px] font-normal text-slate-600">PDFs, scans, photographs and email files, from any carrier. One at a time, or up to {MAX_DOCUMENTS_PER_BATCH} together — a morning&rsquo;s post. Any number of containers per job, 15 MB each.</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 inline-flex min-h-12 items-center justify-center rounded-md bg-[var(--gl-accent)] px-6 text-[17px] font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              >
                Choose documents
              </button>
            </div>
            <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 md:grid-cols-3">
              {[
                { icon: ScanText, title: "Extract", text: "Read the shipment facts from every page, whatever the layout." },
                { icon: FileCheck2, title: "Verify", text: "Review uncertain fields before they enter a job." },
                { icon: ListTodo, title: "Apply", text: "Create the job and recalculate the action queue." },
              ].map((item) => {
                const Icon = item.icon;
                return <div key={item.title} className="flex gap-3"><Icon className="mt-0.5 h-6 w-6 shrink-0 text-[var(--gl-accent)]" aria-hidden="true" /><div><div className="font-semibold text-slate-950">{item.title}</div><div className="mt-1 text-[15px] font-normal text-slate-600">{item.text}</div></div></div>;
              })}
            </div>
          </div>
        </section>
      ) : null}

      {stage === "review" && result ? (
        <div className="mt-7">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="document-review-title">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-[var(--gl-bg-subtle)] px-5 py-5 text-[color:var(--gl-ink)] lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 id="document-review-title" className="flex items-center gap-3 text-xl font-semibold"><FileText className="h-6 w-6" aria-hidden="true" />Review extracted facts</h2>
                <p className="mt-2 break-all text-[17px] font-medium text-[color:var(--gl-ink-faint)]">{result.fileName} · {result.pages} pages · {(result.fileSize / 1024).toFixed(0)} KB</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 text-[17px] font-semibold text-emerald-800">{result.extractedCount} fields extracted</span>
                <span className="inline-flex min-h-11 items-center rounded-full border border-sky-300 bg-sky-50 px-3 text-[17px] font-semibold text-sky-900">{containerDrafts.length} container{containerDrafts.length === 1 ? "" : "s"}</span>
                <span className="inline-flex min-h-11 items-center rounded-full border border-amber-300 bg-amber-50 px-3 text-[17px] font-semibold text-amber-900">{reviewCount} need review</span>
              </div>
            </div>

            <div className="grid xl:grid-cols-[0.82fr_1.18fr]">
              <div className="border-b border-slate-200 bg-slate-100 p-4 xl:border-b-0 xl:border-r">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-800">Source PDF</div>
                  <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-2 font-semibold text-[var(--gl-accent)] underline underline-offset-4">Open separately</a>
                </div>
                <object data={sourceUrl} type="application/pdf" className="h-[680px] w-full rounded-md border border-slate-300 bg-white" aria-label={`Source PDF ${result.fileName}`}>
                  <div className="p-5 text-[17px] text-slate-700">Your browser cannot show the PDF inline. Use “Open separately” while reviewing the extracted fields.</div>
                </object>
              </div>

              <form onSubmit={(event) => { event.preventDefault(); onApply({ ...result, values: effectiveDraft, containers: normalisedContainers, confidence, planning: { demurrageLastFreeDay: planningDemurrage, detentionLastFreeDay: planningDetention, provisional: true } }); }}>
                <div className="flex items-start gap-3 border-b border-sky-200 bg-sky-50 px-5 py-4 text-[17px] font-medium text-sky-900">
                  <CircleDot className="mt-0.5 h-5 w-5 shrink-0 text-[var(--gl-accent)]" aria-hidden="true" />
                  <span>Check fields marked <strong>Review</strong>. Greenlit will never overwrite a job until an operator applies the document.</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {DOCUMENT_FIELD_GROUPS.map((group) => (
                    <React.Fragment key={group.title}>
                      <fieldset>
                        <legend className="w-full bg-slate-100 px-5 py-3 text-[17px] font-semibold text-slate-950">{group.title}</legend>
                        <div className="grid divide-y divide-slate-200 md:grid-cols-2 md:divide-y-0">
                          {group.freeTime
                            ? <FreeTimeFields draft={draft} confidence={confidence} onChange={updateField} />
                            : group.fields.map((field) => <DocumentField key={field.key} field={field} value={draft[field.key]} confidence={confidence[field.key]} onChange={updateField} />)}
                        </div>
                      </fieldset>
                      {group.title === "Shipment" ? <DocumentContainersEditor containers={containerDrafts} onChange={setContainerDrafts} /> : null}
                    </React.Fragment>
                  ))}
                </div>

                <div className="border-t border-amber-200 bg-amber-50 px-5 py-4 text-[17px] text-amber-950">
                  <div className="font-semibold">Planning dates require confirmation</div>
                  <div className="mt-1 font-medium">Greenlit estimates demurrage to {planningDemurrage || "—"} and detention to {planningDetention || "—"} from ETA and the stated free-time terms. Operations must replace them after actual discharge and gate events.</div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={resetIntake} className="min-h-12 rounded-md border border-slate-300 bg-white px-5 text-[17px] font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Choose another PDF</button>
                  <div className="text-right">
                    {requiredMissing.length ? <div className="mb-2 text-[17px] font-semibold text-rose-800">Complete {requiredMissing.length} required field{requiredMissing.length === 1 ? "" : "s"} before applying.</div> : null}
                    {containerIssues.some(Boolean) ? <div className="mb-2 text-[17px] font-semibold text-rose-800">Correct the container list before applying.</div> : null}
                    <button type="submit" disabled={requiredMissing.length > 0 || containerIssues.some(Boolean)} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-[var(--gl-accent)] px-6 py-3 text-[17px] font-semibold text-white hover:bg-[#12366f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-slate-400">
                      <FileCheck2 className="h-6 w-6" aria-hidden="true" />Apply to control tower
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {documents.length ? (
        <section className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="processed-documents-title">
          <div className="border-b border-slate-200 px-5 py-4"><h2 id="processed-documents-title" className="text-xl font-semibold text-slate-950">Processed this session</h2></div>
          <div className="divide-y divide-slate-200">
            {documents.map((document) => (
              <button key={document.id} type="button" onClick={() => onOpenJob(document.jobId)} className="grid min-h-20 w-full gap-2 px-5 py-4 text-left hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-sky-600 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div><div className="break-all text-[17px] font-semibold text-[var(--gl-accent)] underline underline-offset-4">{document.fileName}</div><div className="mt-1 text-[15px] font-normal text-slate-600">{document.carrier} · {document.documentType} · {document.containerCount || 1} container{document.containerCount === 1 ? "" : "s"} · {document.extractedCount} fields</div></div>
                <div className="font-semibold text-slate-900">Applied to {document.jobId}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}





export default function GreenlitControlTower() {
  // Starts empty, not from fixtures. Seeding the screen meant an empty
  // database showed twelve invented jobs that looked exactly like real ones —
  // and after the customer master was purged, that is precisely what happened.
  const [jobs, setJobs] = useState([]);
  // Source of record. Seed data is the offline fallback only; when the API
  // answers, every screen below reads engine-derived values (§56).
  const [source, setSource] = useState("loading");
  const [lastLoaded, setLastLoaded] = useState(null);

  const loadJobs = React.useCallback(() => {
    setSource("loading");
    return fetch("/api/jobs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        const mapped = (data.jobs ?? []).map(jobFromApi);
        setJobs(mapped);
        setSource(mapped.length ? "engine" : "empty");
        setLastLoaded(Date.now());
      })
      .catch(() => {
        // Stale rows are worse than none: a controller cannot tell that what
        // they are reading is no longer coming from the server.
        setJobs([]);
        setSource("offline");
      });
  }, []);

  // Loading the board on mount is the effect's whole purpose: the server is
  // the external system being synchronised from.
  /* eslint-disable-next-line react-hooks/set-state-in-effect */
  useEffect(() => { loadJobs(); }, [loadJobs]);

  /**
   * Keep the board current without being asked.
   *
   * Every command already reloads, so this covers the other case: what
   * somebody else changed while this screen sat open. A control tower that
   * needs a Reload button is one that quietly goes stale between presses, and
   * a stale board is worse than a slow one — it reads as fact.
   *
   * Only while the tab is visible. Polling a screen nobody is looking at
   * spends a query a minute on every forgotten tab.
   */
  useEffect(() => {
    const REFRESH_MS = 60_000;
    let timer = null;

    const start = () => { timer ??= window.setInterval(() => { void loadJobs(); }, REFRESH_MS); };
    const stop = () => { if (timer) { window.clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.visibilityState === "visible") { void loadJobs(); start(); } else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [loadJobs]);
  const [documents, setDocuments] = useState([]);
  // Written in two places and read in none: clearing a unit's maintenance flag
  // records the decision and then nothing consults it, so the unit reappears
  // as under maintenance. Left in place rather than deleted because deleting
  // it would hide the gap; the fix is to make the fleet view read it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [clearedMaintenanceUnits, setClearedMaintenanceUnits] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [workPanel, setWorkPanel] = useState(null);
  const [screen, setScreen] = useState("dashboard");
  const [returnScreen, setReturnScreen] = useState("actions");
  /** Which container tab is open on the job detail screen. */
  const [containerIndex, setContainerIndex] = useState(0);
  const [searchQuery] = useState("");
  const [selectedJobId, setSelectedJobId] = useState(null);
  // Held in the URL, so a reload keeps the filter and the view is shareable.
  const [actionFilter, setActionFilter] = useUrlState("filter", "all");
  const [dashboardFilter, setDashboardFilter] = useState(null);
  const [toast, setToast] = useState("");
  const [, setHighlight] = useState("");
  const [toastTimer, setToastTimer] = useState(null);
  // A company the document names that the master does not have yet.
  const [pendingCompany, setPendingCompany] = useState(null);

  const actionJobs = jobs.filter(isActionRequired).sort((a, b) => urgency(b) - urgency(a));
  const fleet = useFleet();
  const selectedJob = jobs.find((job) => job.id === selectedJobId);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(toastTimer);
    setToastTimer(window.setTimeout(() => setToast(""), 5200));
  }

  /**
   * Open one job, fetching what the board does not carry.
   *
   * The board deliberately does not load the audit timeline or open
   * discrepancies — pulling them for every row was most of the reason it took
   * two seconds. They belong to the job actually on screen, so they are
   * fetched when one is opened, and merged into the row already held so the
   * screen renders immediately rather than waiting.
   */
  function openJob(id) {
    setReturnScreen(screen === "detail" ? "actions" : screen);
    setSelectedJobId(id);
    setScreen("detail");
    // A new job opens on its first container, not on whichever tab index the
    // last job happened to leave behind.
    setContainerIndex(0);
    setHighlight("");
    window.scrollTo({ top: 0, behavior: "smooth" });

    const job = jobs.find((j) => j.id === id);
    if (!job?.apiId) return;
    fetch(`/api/jobs/${encodeURIComponent(job.apiId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload) => {
        if (!payload?.job) return;
        const full = jobFromApi(payload.job);
        setJobs((current) => current.map((j) => (j.id === id ? full : j)));
      })
      // The board's row still renders; only the timeline is missing, and the
      // next action stays correct because it was derived server-side already.
      .catch(() => {});
  }

  function goTo(nextScreen) {
    setScreen(nextScreen);
    setSelectedJobId(null);
    setHighlight("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showActions(filter = "all") {
    const standard = ["us", "customer", "carrier"].includes(filter) ? filter : "all";
    setActionFilter(standard);
    setDashboardFilter(["active", "blocked", "exceptions", "carpark", "freeTime"].includes(filter) ? filter : null);
    goTo("actions");
  }

  function updateJob(id, updater) {
    setJobs((current) => current.map((job) => job.id === id ? updater(job) : job));
  }

  function manageJob(jobId, type, details = {}) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    if (type === "fleet") {
      goTo("fleet");
      return;
    }
    if (type === "checkpoint") {
      if (details.key === "infoComplete") type = "job";
      if (["containerDetails", "containerNumber", "detailsSent", "customerReady", "vgm"].includes(details.key)) {
        type = "container";
        const containers = jobContainers(job);
        const index = containers.findIndex((container) => {
          if (["containerDetails", "containerNumber"].includes(details.key)) return !(container.number && (job.type === "Import" || (container.seal && container.tareKg)));
          if (details.key === "detailsSent") return !container.detailsSent;
          if (details.key === "customerReady") return !container.customerReady;
          return !container.vgmKg || Number(container.vgmKg) <= Number(container.tareKg || 0);
        });
        details = { index: Math.max(0, index) };
      }
      if (details.key === "emptyDelivered") {
        type = "trip";
        details = { tripId: job.trips.find((trip) => trip.type === "Empty Collection")?.id };
      }
    }
    setWorkPanel({ type, jobId, ...details });
  }


  function commitOperationalPanel(panel, draft) {
    if (panel.type === "chassis" && panel.condition === "maintenance") {
      setClearedMaintenanceUnits((current) => current.includes(panel.unit) ? current : [...current, panel.unit]);
      setWorkPanel(null);
      showToast(`Chassis ${panel.unit} passed inspection and returned to the available fleet.`);
      return;
    }

    if (panel.type === "freeTime") {
      // §34. Only the chosen model's figures are sent; the server refuses a
      // mismatch rather than storing one shape under another's name.
      const split = draft.freeTimeModel === "SPLIT";
      const combined = draft.freeTimeModel === "COMBINED";
      void (async () => {
        const response = await fetch(
          `/api/jobs/${encodeURIComponent(panel.jobId)}/containers/${encodeURIComponent(draft.containerId)}/free-time`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              freeTimeModel: draft.freeTimeModel || "NOT_CONFIRMED",
              demurrageFreeDays: split ? numberOrNull(draft.demurrageFreeDays) : undefined,
              demurrageLfd: split ? draft.demurrageLfd || null : undefined,
              detentionFreeDays: split ? numberOrNull(draft.detentionFreeDays) : undefined,
              detentionLfd: split ? draft.detentionLfd || null : undefined,
              combinedFreeDays: combined ? numberOrNull(draft.combinedFreeDays) : undefined,
              combinedLfd: combined ? draft.combinedLfd || null : undefined,
              freeTimeRemarks: draft.freeTimeRemarks || null,
              // §34.2. Both or neither, which is what the database checks too.
              // A blank rate clears the currency with it rather than leaving a
              // label on nothing.
              dailyRate: numberOrNull(draft.dailyRate),
              currency: numberOrNull(draft.dailyRate) === null ? null : (draft.currency || "SGD"),
            }),
          },
        ).catch(() => null);

        const payload = await response?.json().catch(() => ({}));
        if (!response?.ok) {
          showToast(payload?.error ?? "Could not save the free-time terms.");
          return;
        }
        setWorkPanel(null);
        await loadJobs();
        showToast(draft.freeTimeModel === "NOT_CONFIRMED"
          ? "Free-time terms cleared. No countdown until they are confirmed."
          : "Free-time terms confirmed. The countdown starts from these.");
      })();
      return;
    }

    const targetJobId = panel.type === "chassis" && panel.condition === "available" ? draft.jobId : panel.jobId;
    if (!targetJobId) return;
    if (panel.type === "container") {
      // §29. This did all three of add, amend and remove in React state and
      // wrote nothing down — and containers carry the free-time clocks, so
      // what vanished on reload was the deadline.
      const base = `/api/jobs/${encodeURIComponent(targetJobId)}/containers`;
      const existing = jobContainers(jobs.find((j) => j.id === targetJobId) ?? {})[panel.index || 0];

      void (async () => {
        const request = draft._delete
          ? { url: `${base}/${encodeURIComponent(existing?.id ?? "")}`, method: "DELETE", body: null }
          : panel.mode === "new"
            ? { url: base, method: "POST", body: {
                containerNumber: draft.number || null,
                sizeType: draft.sizeType || draft.type || null,
                sealNumber: draft.seal || null,
                grossWeight: numberOrNull(draft.grossWeight),
                packageCount: numberOrNull(draft.packageCount),
                packageType: draft.packageType || null,
              } }
            : { url: `${base}/${encodeURIComponent(existing?.id ?? "")}`, method: "PATCH", body: {
                containerNumber: draft.number || null,
                containerSize: draft.sizeType || draft.type || null,
                sealNumber: draft.seal || null,
                grossWeight: numberOrNull(draft.grossWeight),
                packageCount: numberOrNull(draft.packageCount),
                packageType: draft.packageType || null,
              } };

        const response = await fetch(request.url, {
          method: request.method,
          headers: { "content-type": "application/json" },
          body: request.body ? JSON.stringify(request.body) : undefined,
        }).catch(() => null);

        const payload = await response?.json().catch(() => ({}));
        if (!response?.ok) {
          showToast(payload?.error ?? "Could not save that container.");
          return;
        }
        setWorkPanel(null);
        await loadJobs();
        setHighlight("container");
        window.setTimeout(() => setHighlight(""), 1400);
        showToast(draft._delete
          ? "Container removed."
          : panel.mode === "new" ? "Container added." : "Container updated.");
      })();
      return;
    }
    if (panel.type === "trip") {
      // §18. This rewrote the job in React state, which meant planning a trip
      // was entirely fictional: the engine has rules about movements being
      // overdue and there was nothing that could create one.
      const base = `/api/jobs/${encodeURIComponent(targetJobId)}/movements`;

      void (async () => {
        const request = draft.status === "Cancelled" && panel.tripId
          ? {
              url: `${base}/${encodeURIComponent(panel.tripId)}`,
              method: "DELETE",
              body: { reason: draft.cancelledReason || "" },
            }
          : panel.tripId
            ? {
                url: `${base}/${encodeURIComponent(panel.tripId)}`,
                method: "PATCH",
                body: {
                  plannedDate: draft.plannedDate || null,
                  ...(draft.status ? { movementStatus: MOVEMENT_STATUS_FOR[draft.status] } : {}),
                },
              }
            : {
                url: base,
                method: "POST",
                body: {
                  movementType: MOVEMENT_TYPE_FOR[draft.type] ?? null,
                  containerId: draft.containerRef || null,
                  origin: draft.origin || null,
                  destination: draft.destination || null,
                  plannedDate: draft.plannedDate || null,
                },
              };

        const response = await fetch(request.url, {
          method: request.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request.body),
        }).catch(() => null);

        const payload = await response?.json().catch(() => ({}));
        if (!response?.ok) {
          showToast(payload?.error ?? "Could not save that trip.");
          return;
        }
        setWorkPanel(null);
        await loadJobs();
        setHighlight("trip");
        window.setTimeout(() => setHighlight(""), 1400);
        showToast(draft.status === "Cancelled"
          ? "Trip cancelled. Its reference is retired."
          : panel.tripId ? "Trip updated." : "Trip planned.");
      })();
      return;
    }

    if (panel.type === "checkpoint") {
      // The same bug the job drawer had, in a place where the routes already
      // existed: the buttons on the job screen persisted these and this drawer
      // did not, so the same fact saved or vanished depending on which control
      // you happened to use.
      const route = panel.key === "cmsCompleted" ? "cms"
        : panel.key === "transhipment" ? "transhipment"
        : null;

      if (!route) {
        // deliveryPath has no command behind it. Saying so beats a toast that
        // claims a save nothing performed.
        showToast("That checkpoint cannot be recorded yet.");
        return;
      }

      void (async () => {
        const response = await fetch(
          `/api/jobs/${encodeURIComponent(targetJobId)}/${route}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: draft.value }),
          },
        ).catch(() => null);

        const payload = await response?.json().catch(() => ({}));
        if (!response?.ok) {
          showToast(payload?.error ?? "Could not save that checkpoint.");
          return;
        }
        setWorkPanel(null);
        await loadJobs();
        setHighlight("readiness");
        window.setTimeout(() => setHighlight(""), 1400);
        showToast("Checkpoint saved. Status and next action recalculated.");
      })();
      return;
    }

    if (panel.type === "job") {
      // §30. This used to rewrite the job in React state and stop there: the
      // correction appeared, persisted nothing, and survived until the next
      // reload — which is worse than not offering the edit, because the
      // controller believed it.
      // Looked up here rather than relying on an outer `job`: this runs
      // inside the commit handler, where the only thing identifying the job is
      // the panel's id.
      const edited = jobs.find((candidate) => candidate.id === targetJobId);

      void (async () => {
        const response = await fetch(`/api/jobs/${encodeURIComponent(targetJobId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            vesselName: draft.vessel ?? null,
            blNumber: draft.booking ?? null,
            deliveryAddress: draft.deliveryAddress ?? null,
            // The same drawer field means the terminal on an import and the
            // collection yard on an export, because operationally it is the
            // same question: where does this container sit.
            ...(edited?.type === "Import"
              ? { terminal: draft.operatingLocation ?? null }
              : { emptyCollectionYard: draft.operatingLocation ?? null }),
          }),
        }).catch(() => null);

        const payload = await response?.json().catch(() => ({}));
        if (!response?.ok) {
          showToast(payload?.error ?? "Could not save those changes.");
          return;
        }
        setWorkPanel(null);
        await loadJobs();
        setHighlight("readiness");
        window.setTimeout(() => setHighlight(""), 1400);
        showToast("Job information saved. Status and next action recalculated.");
      })();
      return;
    }

    let activityMessage = "Job updated. Status and next action recalculated.";
    let nextHighlight = "status";
    updateJob(targetJobId, (job) => {

      if (panel.type === "trip") {
        activityMessage = panel.tripId ? `${panel.tripId} updated. Job progress recalculated.` : "New trip created under the same job.";
        nextHighlight = `trip:${panel.tripId || nextTripReference(job.trips)}`;
        return applyTripUpdate(job, panel.tripId, draft);
      }
      if (panel.type === "chassis" && panel.condition === "available") {
        activityMessage = `Chassis ${panel.unit} assigned to ${targetJobId}.`;
        return assignChassis(job, panel.unit, panel.size);
      }
      if (panel.type === "chassis" && panel.condition === "assigned" && draft.action === "release") {
        activityMessage = `Chassis ${panel.unit} released to the available fleet.`;
        return releaseChassis(job, panel.unit);
      }
      if (panel.type === "freeTime") {
        activityMessage = "Free-time dates confirmed and risk recalculated.";
        return applyFreeTime(job, draft);
      }
      return job;
    });
    setWorkPanel(null);
    setHighlight(nextHighlight);
    window.setTimeout(() => setHighlight(""), 1400);
    showToast(activityMessage);
  }

  /**
   * Runs a command against the server and reloads from it.
   *
   * Reloading rather than patching locally means the screen shows what was
   * actually stored, including everything the engine recomputed downstream —
   * a status change, a new next action, a movement the trigger created. A
   * failure leaves the screen untouched and says so, because an action that
   * was not recorded must not look like one that was.
   */
  async function runJobCommand(job, path, body, successMessage) {
    if (!job) return false;
    const id = job.apiId ?? job.id;
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(id)}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast(payload.error ?? `That could not be saved (HTTP ${response.status}).`);
        return false;
      }
      await loadJobs();
      if (successMessage) showToast(successMessage);
      return true;
    } catch {
      showToast("That could not be saved. Nothing was changed.");
      return false;
    }
  }

  /** §40.2. Recording CMS opens the empty collection gate (§41). */
  async function recordCms() {
    await runJobCommand(selectedJob, "/cms", { status: "COMPLETED" },
      "CMS recorded. The empty collection gate reopened.");
  }

  /** §39. Container number, seal and tare are captured together. */
  async function recordDetails(details) {
    const container = selectedJob?.containers?.[0];
    if (!container) { showToast("This job has no container to identify."); return; }
    await runJobCommand(
      selectedJob,
      `/containers/${encodeURIComponent(container.id ?? container.ref)}/identity`,
      {
        containerNumber: details?.number ?? container.number,
        sealNumber: details?.seal ?? container.seal,
        tareWeightKg: Number(details?.tareKg ?? container.tare ?? 0),
      },
      "Container details recorded.",
    );
  }

  /**
   * §42. Tell the customer the container's number, and record that we did.
   *
   * The recipient is typed because it varies per booking; everything else in
   * the message comes off the job. §42 stores the send so the silent delay it
   * describes — "the container is delivered, but the customer does not know
   * its number and therefore cannot begin stuffing" — becomes a fact somebody
   * can check rather than an assumption.
   */
  async function sendContainerDetails({ sentTo, reference }) {
    const container = selectedJob?.containers?.[0];
    if (!container) { showToast("This job has no container to notify about."); return; }
    await runJobCommand(
      selectedJob,
      `/containers/${encodeURIComponent(container.id ?? container.ref)}/details-sent`,
      { sentTo, reference },
      "Container details sent. The customer can begin stuffing.",
    );
  }

  /** §44.1. The answer is stored with a timestamp and a user, not just "checked". */
  async function setTranshipment(answer) {
    const status = answer === "available" ? "AVAILABLE" : "NOT_AVAILABLE";
    await runJobCommand(selectedJob, "/transhipment", { status },
      status === "AVAILABLE"
        ? "Transhipment available. The laden movement to port can be arranged."
        : "Transhipment unavailable. Check whether the customer wants the carpark.");
  }




  async function resolveDiscrepancy(discrepancy, choice) {
    const job = jobs.find((j) => (j.discrepancies || []).includes(discrepancy));
    if (!job) return;
    try {
      const response = await fetch(`/api/jobs/${job.apiId ?? job.id}/discrepancies/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ field: discrepancy.field, choice }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await loadJobs();
    } catch {
      // The decision was not recorded, so the conflict must stay visible.
      showToast("That decision could not be saved. The conflict is still open.");
    }
  }

  /**
   * §11. Applies an extracted document to the control tower.
   *
   * The job is created on the SERVER so it gets a customer-scoped reference
   * (ADR-0007), an audit entry, and permission checking. Previously this built
   * a job in browser state, which meant intake produced records the engine had
   * never seen and no conflict could ever be recorded against them.
   *
   * The PDF itself never leaves the browser — that contract is unchanged. Only
   * the extracted fields are sent.
   */
  /** Discards server state and rebuilds from the seeded fixtures. */
  /**
   * §9. Apply one document to a company the batch has already chosen.
   *
   * applyDocument works out the company itself, which is right for a single
   * notice and wrong for a batch: the operator confirmed the grouping on the
   * review screen, and looking it up again would let a job land somewhere the
   * screen did not say.
   */
  async function applyDocumentFor(result, customerCode) {
    return applyDocument(result, customerCode);
  }

  async function applyDocument(result, forcedCustomerCode) {
    const fields = result.values ?? {};

    // §11.2 detects the customer rather than asking for it. The master is the
    // authority: a code is human-chosen and immutable, so intake matches
    // against it and refuses rather than inventing one.
    const named = String(fields.consignee || fields.notify || "").trim();
    const customers = await fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : { customers: [] }))
      .then((d) => d.customers ?? [])
      .catch(() => []);

    // The batch screen has already decided and shown the operator; honouring
    // that beats matching a second time and possibly landing somewhere the
    // screen did not say. Otherwise the same rule the batch screen uses,
    // lifted into the engine so one document and twenty cannot disagree.
    const match = forcedCustomerCode
      ? customers.find((c) => c.code === forcedCustomerCode)
      : matchCustomer(named, customers)?.customer;

    if (!match) {
      // Sending the operator to another screen to type a name the document
      // already contains, then back again to redo the apply, is three steps to
      // record something the system just read. Offer it here instead; the code
      // still has to be confirmed, because it is immutable once issued.
      const companyName = companyNameFromConsignee(named);
      if (!companyName) {
        showToast("This document names no consignee, so there is nothing to match a company against.");
        return;
      }
      setPendingCompany({ companyName, code: suggestCode(companyName), document: result, error: "" });
      return;
    }

    const incomingNumbers = new Set((result.containers || []).map((c) => c.number).filter(Boolean));
    const existing = jobs.find((job) => job.type === "Import" && (
      (fields.billOfLading && job.documentFields?.billOfLading === fields.billOfLading)
      || (job.containers || []).some((c) => incomingNumbers.has(c.number))
    ));

    if (existing) {
      // §12: an extraction never silently overwrites a critical field. Each
      // conflict is raised as a record for the controller to decide.
      const extracted = toExtractedFields(fields, result.confidence || {},
        result.fileName || "document", new Date().toISOString());
      const { discrepancies } = reconcileExtraction(existing.documentFields || {}, extracted,
        { criticalFields: INTAKE_CRITICAL_FIELDS });

      for (const d of discrepancies) {
        await fetch(`/api/jobs/${encodeURIComponent(existing.apiId ?? existing.id)}/discrepancies`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...d }),
        }).catch(() => {});
      }
      await loadJobs();
      showToast(discrepancies.length
        ? `${existing.id}: ${discrepancies.length} conflict${discrepancies.length === 1 ? "" : "s"} raised for review.`
        : `${existing.id} updated from ${result.fileName ?? "the document"}.`);
      setSelectedJobId(existing.id);
      setReturnScreen("documents");
      setScreen("detail");
      return;
    }

    // Which direction this job runs. An export job is a booking rather than
    // an arrival: it is worked against the vessel closing, not free time, and
    // opening one the wrong way round means chasing the wrong deadline for
    // its whole life. Defaults to import, which is what every document read
    // before this point was.
    const isExport = result.domain === "EXPORT";

    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(isExport ? {
        domain: "EXPORT",
        customerCode: match.code,
        shipper: fields.shipper ?? null,
        bookingReference: fields.bookingNumber ?? null,
        exportClearanceReference: fields.exportClearanceReference ?? null,
        vesselName: fields.vessel ?? null,
        voyageNumber: fields.voyage ?? null,
        etaSingapore: fields.eta ?? null,
        vesselClosingAt: fields.vesselClosingAt ?? null,
        emptyCollectionYard: fields.emptyCollectionYard ?? null,
        containerQuantity: numberOrNull(fields.containerQuantity) ?? undefined,
        containerSizeType: (result.containers ?? [])[0]?.type ?? null,
      } : {
        domain: "IMPORT",
        customerCode: match.code,
        blNumber: fields.billOfLading ?? null,
        houseBlNumber: fields.houseBillOfLading ?? null,
        vesselName: fields.vessel ?? null,
        voyageNumber: fields.voyage ?? null,
        eta: fields.eta ?? null,
        deliveryAddress: fields.deliveryAddress ?? null,
        // The containers the controller just reviewed. These were being
        // discarded: the job was created with none, and because free time is
        // per container and every container command addresses one, the job
        // could never progress and the numbers could never be added back.
        containers: (result.containers ?? []).map((c) => ({
          containerNumber: c.number || null,
          sizeType: c.type || null,
          sealNumber: c.seal || null,
          grossWeight: numberOrNull(c.grossWeight),
          packageCount: numberOrNull(c.packageCount),
          packageType: c.packageType || null,
          freeTimeModel: fields.freeTimeModel || null,
          demurrageFreeDays: numberOrNull(fields.demurrageFreeDays),
          detentionFreeDays: numberOrNull(fields.detentionFreeDays),
          combinedFreeDays: numberOrNull(fields.combinedFreeDays),
          freeTimeRemarks: fields.freeTimeRemarks || null,
        })),
      }),
    }).catch(() => null);

    if (!response?.ok) {
      const payload = await response?.json().catch(() => ({}));
      showToast(payload?.error ?? "That document could not be applied.");
      return;
    }

    const { job } = await response.json();

    // §10. File the document against the job it just created. Best-effort and
    // deliberately after: the job is the thing that had to succeed, and losing
    // the file is a smaller failure than refusing a job that is already
    // correct. If it fails the controller is told, and can attach it later.
    if (result.file) {
      const filing = new FormData();
      filing.append("file", result.file);
      filing.append("documentType", "ARRIVAL_NOTICE");
      filing.append("source", "MANUAL_UPLOAD");

      const filed = await fetch(
        `/api/jobs/${encodeURIComponent(job.jobId)}/documents`,
        { method: "POST", body: filing },
      ).catch(() => null);

      if (!filed?.ok) {
        showToast("The job was created, but the document was not filed against it.");
      }
    }

    setDocuments((current) => [{
      id: `DOC-${Date.now()}`,
      jobId: job.jobNumber,
      fileName: result.fileName,
      carrier: fields.carrier,
      documentType: fields.documentType,
      extractedCount: result.extractedCount,
      containerCount: result.containers?.length || 1,
    }, ...current]);

    await loadJobs();
    showToast(`${job.jobNumber} created for ${match.companyName} from ${result.fileName ?? "the document"}.`);
    setSelectedJobId(job.jobNumber);
    setReturnScreen("documents");
    setScreen("detail");
  }
  const navItems = [
    { id: "dashboard", label: "Dashboard", count: jobs.filter((job) => jobStatus(job) !== "Completed").length, icon: LayoutDashboard },
    { id: "actions", label: "Action Required", count: actionJobs.length, icon: ListTodo },
    { id: "jobs", label: "Jobs", count: jobs.length, icon: ClipboardList },
    { id: "documents", label: "Document Intake", count: documents.length, icon: FileSearch },
    { id: "planning", label: "Planning Board", count: null, icon: CalendarRange },
    { id: "drivers", label: "Drivers & Vehicles", count: fleet.vehicles?.length ?? null, icon: Truck },
    { id: "fleet", label: "Chassis Master", count: fleet.available.length, icon: Container },
    { id: "emptyReturns", label: "Empty Returns", count: null, icon: Undo2 },
    { id: "companies", label: "Customer Master", count: null, icon: Building2 },
    { id: "billing", label: "Billing Ready", count: null, icon: Receipt },
    { id: "people", label: "People", count: null, icon: UserRound },
  ];

  return (
    <div className="min-h-screen bg-[color:var(--gl-bg)] font-sans text-[17px] leading-normal text-slate-900 lg:flex lg:items-start">
      <style>{`
        @font-face {
          font-family: "Greenlit Hyperlegible";
          src: url("data:font/woff2;base64,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") format("woff2");
          font-style: normal;
          font-weight: 700;
          font-display: swap;
        }
        :root { color-scheme: light; }
        html { scroll-behavior: smooth; }
        h1, h2, .greenlit-display { font-family: var(--gl-font-sans); }
        * { scrollbar-color: #64748b #e2e8f0; scrollbar-width: auto; }
        button, a { cursor: pointer; -webkit-tap-highlight-color: transparent; transition-duration: 180ms; transition-timing-function: cubic-bezier(.22,1,.36,1); }
        button:disabled { cursor: not-allowed; opacity: .55; }
        input, textarea, select { caret-color: var(--gl-accent); }
        ::selection { background: var(--gl-accent); color: #ffffff; }
        .greenlit-release-flash { animation: greenlitRelease 1.1s cubic-bezier(.16,1,.3,1); }
        .greenlit-new-row { animation: greenlitRow 1.35s cubic-bezier(.16,1,.3,1); }
        .greenlit-text-flash { animation: greenlitText 1.1s cubic-bezier(.16,1,.3,1); }
        .greenlit-drawer { animation: greenlitDrawer .26s cubic-bezier(.16,1,.3,1); }
        @keyframes greenlitRelease {
          0% { box-shadow: inset 0 0 0 999px rgba(16,185,129,.14), 0 8px 24px rgba(15,35,51,.12); }
          100% { box-shadow: inset 0 0 0 0 rgba(16,185,129,0), 0 0 0 rgba(15,35,51,0); }
        }
        @keyframes greenlitRow {
          0% { background: #d1fae5; clip-path: inset(0 100% 0 0); }
          45% { background: #d1fae5; clip-path: inset(0 0 0 0); }
          100% { background: #ffffff; clip-path: inset(0 0 0 0); }
        }
        @keyframes greenlitText {
          0% { color: #bae6fd; text-shadow: 0 6px 18px rgba(0,0,0,.16); }
          100% { color: white; text-shadow: none; }
        }
        @keyframes greenlitDrawer {
          0% { transform: translateX(34px); opacity: .72; box-shadow: -4px 0 14px rgba(15,35,51,.08); }
          100% { transform: translateX(0); opacity: 1; box-shadow: -20px 0 50px rgba(15,35,51,.22); }
        }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .greenlit-release-flash, .greenlit-new-row, .greenlit-text-flash, .greenlit-drawer { animation-duration: .01ms; animation-iteration-count: 1; }
        }
      `}</style>

      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-md bg-white px-5 py-3 font-semibold text-[var(--gl-accent)] shadow-lg focus:translate-y-0 focus:outline focus:outline-4 focus:outline-sky-600">Skip to main content</a>

      {/* The one place colour is a wayfinding cue rather than a status: the
          bar you are always looking at, so you always know which system you
          are in. White on it measures 8.72:1. */}
      {/* The shell: a rail on the left, the work on the right.
          Tabs across the top ran out of room at six sections and would have
          run out again — the rail grows downward, which is the direction a
          list of sections actually grows. It keeps the blue, because the one
          piece of chrome you are always looking at is what tells you which
          system you are in.

          One nav element, not two: a row that scrolls on a phone and a column
          from `lg` up. Two navs would be two lists to keep in step. */}
      <aside className="sticky top-0 z-40 bg-[color:var(--gl-accent)] text-white lg:h-screen lg:w-[236px] lg:shrink-0">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:block lg:px-5 lg:py-5">
          {/* The white mark, because the rail is the brand colour. The wordmark
              already says Zheng He Logistics, so the line under it names the
              system rather than repeating the company. */}
          <Image
            src="/logo-cropped.png"
            alt="Zheng He Logistics"
            width={2217}
            height={676}
            className="h-8 w-auto shrink-0 lg:h-9"
            priority
          />
          <div className="lg:mt-3">
            <div className="text-[19px] font-medium tracking-[-0.008em] text-white">Greenlit</div>
            <div className="mt-1 text-[15px] font-normal text-white/90">Singapore transport control</div>
          </div>
        </div>

        <nav
          aria-label="Main navigation"
          className="flex overflow-x-auto border-t border-white/20 lg:mt-1 lg:flex-col lg:overflow-visible lg:border-t-0 lg:px-3"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = screen === item.id || (screen === "detail" && returnScreen === item.id);
            return (
              /*
                On the rail, the current section is a filled panel the colour
                of the page, so the section reads as continuous with the work
                beside it rather than as a tab pointing at it. On the phone
                row there is no "beside", so it stays the rule under the
                label that the top bar used.

                Both states clear 7:1 on the blue, so the difference is
                carried by weight and ground rather than by fading one of
                them toward the background.
              */
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(item.id)}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-14 min-w-0 shrink-0 cursor-pointer items-center gap-3 px-4 text-[16px] transition-colors duration-150 focus-visible:outline focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-white lg:w-full lg:rounded-lg lg:px-3 ${
                  active
                    ? "font-semibold text-white after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-sm after:bg-white after:content-[''] lg:bg-[color:var(--gl-bg)] lg:text-[color:var(--gl-accent)] lg:after:hidden"
                    : "font-normal text-white/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-center leading-tight lg:text-left">{item.label}</span>
                {/* gl-figures, not gl-data: gl-data carries color:ink and is
                    defined after Tailwind, so it won over text-white and
                    rendered these counts near-black on the blue. */}
                <span className={`gl-figures ${active ? "text-white lg:text-[color:var(--gl-accent)]" : "text-white/90"}`}>{item.count}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* When the board last updated, and who is acting. Off the blue now:
            on a white bar these are two quiet facts rather than two things
            competing with the brand. */}
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-end gap-5 border-b border-[color:var(--gl-line)] bg-[color:var(--gl-bg)] px-4 sm:px-6 lg:min-h-16 lg:gap-6 lg:px-8">
          {/* Reload and Reset used to sit here. A control tower asking to be
              reloaded is admitting it does not keep itself current, and Reset
              refused on a Supabase-backed instance anyway, so it was a button
              whose only outcome was an error. The board refreshes itself;
              this says when it last did. */}
          <LastUpdated at={lastLoaded} stale={source === "offline"} />
          <ActingUser />
        </header>

      {(screen === "dashboard" || screen === "actions") && source !== "engine" ? (
        <BoardState source={source} onRetry={loadJobs} onAddDocument={() => goTo("documents")} />
      ) : null}
      {screen === "dashboard" && source === "engine" ? <ZhtDashboard jobs={jobs} today={operationalToday()} onOpenJob={openJob} onNewJob={() => goTo("documents")} onShowActions={showActions} /> : null}
      {screen === "actions" && source === "engine" ? <ActionRequired jobs={actionJobs} filter={actionFilter} setFilter={setActionFilter} dashboardFilter={dashboardFilter} clearDashboardFilter={() => setDashboardFilter(null)} onOpen={openJob} /> : null}
      {screen === "documents" ? <DocumentIntake documents={documents} onApply={applyDocument} onApplyBatch={applyDocumentFor} onOpenJob={openJob} /> : null}
      {screen === "people" ? <People /> : null}
      {screen === "companies" ? (
        <ZhtCustomers onOpenCustomer={(code) => { setSelectedCompany(code); setScreen("company"); }} />
      ) : null}
      {screen === "company" && selectedCompany ? (
        <ZhtCustomerDetail code={selectedCompany}
          onBack={() => { setSelectedCompany(null); setScreen("companies"); }} />
      ) : null}
      {screen === "fleet" ? <ZhtChassis fleet={fleet} onOpenJob={(job) => openJob(job.id)} onUnit={(item) => setWorkPanel({ type: "chassis", jobId: item.jobId, unit: item.unit, size: item.size, condition: item.condition })} /> : null}
      {screen === "jobs" ? <ZhtJobs jobs={jobs} onOpenJob={(job) => openJob(job.id)} onNewJob={() => goTo("documents")} /> : null}
      {screen === "planning" ? <ZhtPlanning jobs={jobs} onOpenJob={(job) => openJob(job.id)} /> : null}
      {screen === "drivers" ? <ZhtDrivers fleet={fleet} /> : null}
      {screen === "emptyReturns" ? <ZhtEmptyReturns jobs={jobs} onOpenJob={(job) => openJob(job.id)} /> : null}
      {screen === "billing" ? <ZhtBilling jobs={jobs} onOpenJob={(job) => openJob(job.id)} /> : null}
      {screen === "search" ? <ZhtSearchResults jobs={jobs} query={searchQuery} onOpenJob={(job) => openJob(job.id)} onBack={() => goTo(returnScreen)} /> : null}
      {screen === "detail" && selectedJob ? (
        <ZhtJobDetail
          job={selectedJob}
          containerIndex={containerIndex}
          onSelectContainer={setContainerIndex}
          onBack={() => goTo(returnScreen)}
          onRecordCms={recordCms}
          onRecordDetails={recordDetails}
          onSendDetails={sendContainerDetails}
          onSetTranshipment={setTranshipment}
          onManage={(type, details) => manageJob(selectedJob.id, type, details)}
          /* The panels that carry capability his demo has no card for —
             permits, documents, free time and the charge estimate, closure,
             and §12 discrepancies. Passed in rather than rebuilt so nothing
             built already becomes unreachable behind the new screen. They are
             still in our styling; restyling them into his language is the
             next pass, not a reason to drop them now. */
          extras={(
            <>
              {/* Each of these takes the ids and callbacks it declares. They
                  were being handed a whole `job` and an `onManage` they do not
                  accept, so TripTable read `trips.length` off undefined and
                  took the screen down with it. */}
              <PermitPanel
                jobId={selectedJob.apiId}
                containers={selectedJob.containers ?? []}
                onChanged={loadJobs}
              />
              <FreeTimePanel container={(selectedJob.containers ?? [])[containerIndex] ?? (selectedJob.containers ?? [])[0]} />
              <DocumentsPanel jobId={selectedJob.apiId} />
              <TripTable
                trips={selectedJob.trips ?? []}
                onOpenTrip={(tripId) => manageJob(selectedJob.id, "trip", { tripId })}
              />
              <DiscrepancyReview job={selectedJob} onResolve={resolveDiscrepancy} />
              <ClosurePanel jobId={selectedJob.apiId} onChanged={loadJobs} />
            </>
          )}
        />
      ) : null}

      <OperationsDrawer panel={workPanel} jobs={jobs} onClose={() => setWorkPanel(null)} onCommit={commitOperationalPanel} />

      {pendingCompany ? (
        <UnknownCompanyPrompt
          pending={pendingCompany}
          onCancel={() => setPendingCompany(null)}
          onChange={(next) => setPendingCompany((prev) => ({ ...prev, ...next }))}
          onCreated={async (document) => {
            setPendingCompany(null);
            await applyDocument(document);
          }}
        />
      ) : null}

      </div>

      {toast ? (
        <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 flex max-w-[560px] items-start gap-3 rounded-lg border border-emerald-300 bg-white p-5 text-[17px] font-semibold text-slate-900 shadow-[0_12px_32px_rgba(15,23,42,0.2)]">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast("")} aria-label="Dismiss message" className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-600"><X className="h-5 w-5" /></button>
        </div>
      ) : null}
    </div>
  );
}
