"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Sign in with an email and a password.
 *
 * Password rather than a magic link: a magic link needs working email
 * delivery and a controller who can reach their inbox on a warehouse floor,
 * and a beta should not fail on either.
 */
export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error: failure } = await client.auth.signInWithPassword({ email, password });

    if (failure) {
      // Supabase says "Invalid login credentials" for both a wrong password
      // and an unknown address, and it is right not to say which.
      setError("That email and password did not match. Check both, or ask an administrator to reset it.");
      setBusy(false);
      return;
    }
    // A full load, so the server picks up the session cookie the client set.
    window.location.assign("/");
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-[440px] flex-col justify-center px-6">
      <div>
        <h1 className="gl-display">Greenlit</h1>
        <p className="gl-body mt-1 text-[color:var(--gl-ink-muted)]">Singapore transport control</p>
      </div>

      <form onSubmit={submit} className="mt-8 grid gap-5">
        <label className="grid gap-2">
          <span className="gl-label">Email</span>
          <input
            type="email" required autoComplete="username" value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px] text-[color:var(--gl-ink)]"
          />
        </label>

        <label className="grid gap-2">
          <span className="gl-label">Password</span>
          <input
            type="password" required autoComplete="current-password" value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-12 rounded-md border border-[color:var(--gl-line-strong)] bg-white px-3 text-[17px] text-[color:var(--gl-ink)]"
          />
        </label>

        {error ? (
          <p role="alert" className="gl-body rounded-md border border-rose-300 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit" disabled={busy}
          className="min-h-12 rounded-md border-0 bg-[color:var(--gl-accent)] px-5 text-[17px] font-semibold text-white hover:bg-[color:var(--gl-accent-hover)] disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="gl-caption mt-6">
        Trouble signing in? An administrator can reset your password in Supabase.
      </p>
    </main>
  );
}
