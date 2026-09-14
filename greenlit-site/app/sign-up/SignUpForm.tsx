"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { canJoin, STAFF_EMAIL_DOMAIN } from "@greenlit/engine";

/**
 * §7. Creating your own account.
 *
 * Self-service, because an administrator typing six colleagues' details into a
 * form is a worse first day than each of them spending a minute on this. What
 * registration does not decide is the role: everyone arrives as Operations and
 * an administrator raises them from there. A person who could choose their own
 * role would have no role.
 *
 * The name is asked for rather than derived, because §13 writes it on every
 * change they make and "Sarah Lim" is a person while "sarah.lim" is a login.
 */
export default function SignUpForm() {
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    // Checked here so the answer is immediate, and again on the server on
    // every sign-in, because this check runs in the browser and anything that
    // runs in the browser is a courtesy rather than a control.
    const allowed = canJoin(form.email);
    if (!allowed.ok) { setError(allowed.reason ?? "That address cannot be used"); return; }
    if (!form.displayName.trim()) {
      setError("Your name goes on every change you make, so it cannot be blank.");
      return;
    }
    if (form.password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    setBusy(true);
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error: failure } = await client.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { display_name: form.displayName.trim() } },
    });
    setBusy(false);

    if (failure) {
      setError(/already/i.test(failure.message)
        ? "There is already an account for that address. Sign in instead."
        : failure.message);
      return;
    }

    // A project with email confirmation on returns a user with no session.
    // Saying "check your inbox" when no email was sent is worse than saying
    // nothing, so the two cases are distinguished rather than guessed at.
    if (data.session) { window.location.assign("/"); return; }
    setDone(true);
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-[440px] flex-col justify-center px-6">
        <h1 className="gl-display">Check your email</h1>
        <p className="gl-body-plain mt-3 text-[color:var(--gl-ink-muted)]">
          We sent a confirmation link to <strong>{form.email}</strong>. Open it,
          then sign in.
        </p>
        <p className="gl-caption mt-6">
          Nothing arrived? An administrator can confirm your account directly.
        </p>
        <a href="/sign-in" className="mt-6 text-[17px] font-semibold text-[color:var(--gl-accent)] underline underline-offset-4">
          Back to sign in
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-[440px] flex-col justify-center px-6 py-10">
      <div>
        <h1 className="gl-display">Create your account</h1>
        <p className="gl-body-plain mt-1 text-[color:var(--gl-ink-muted)]">
          For Zheng He staff. You start with access to run jobs; an
          administrator can widen that later.
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 grid gap-5">
        <label className="grid gap-2">
          <span className="gl-label">Your name</span>
          <input
            required autoComplete="name" value={form.displayName}
            onChange={set("displayName")} placeholder="Sarah Lim"
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px] text-[color:var(--gl-ink)]"
          />
          <span className="gl-caption">Goes on every change you make.</span>
        </label>

        <label className="grid gap-2">
          <span className="gl-label">Work email</span>
          <input
            type="email" required autoComplete="username" value={form.email}
            onChange={set("email")} placeholder={`sarah@${STAFF_EMAIL_DOMAIN}`}
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px] text-[color:var(--gl-ink)]"
          />
          <span className="gl-caption">Must be @{STAFF_EMAIL_DOMAIN}.</span>
        </label>

        <label className="grid gap-2">
          <span className="gl-label">Password</span>
          <input
            type="password" required autoComplete="new-password" minLength={8}
            value={form.password} onChange={set("password")}
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px] text-[color:var(--gl-ink)]"
          />
          <span className="gl-caption">At least 8 characters.</span>
        </label>

        {error ? (
          <p role="alert" className="gl-body-plain rounded-md border border-rose-300 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit" disabled={busy}
          className="min-h-12 rounded-md border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-semibold text-white hover:bg-[color:var(--gl-accent-hover)] disabled:opacity-60"
        >
          {busy ? "Creating your account…" : "Create account"}
        </button>
      </form>

      <p className="gl-body-plain mt-6 text-[color:var(--gl-ink-muted)]">
        Already have an account?{" "}
        <a href="/sign-in" className="font-semibold text-[color:var(--gl-accent)] underline underline-offset-4">
          Sign in
        </a>
      </p>
    </main>
  );
}
