"use client";

import Image from "next/image";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

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
  const [stayIn, setStayIn] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    // How long the session cookie outlives the browser. Checked, it is a
    // month, so a controller signs in once and not every morning; unchecked,
    // maxAge is left off entirely, which makes it a session cookie that dies
    // when the browser closes — the behaviour someone wants on the warehouse
    // machine that four people share.
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      stayIn ? { cookieOptions: { maxAge: THIRTY_DAYS_IN_SECONDS } } : undefined,
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
        {/* The navy mark here, on the white ground, because this is the page
            that says whose system this is before anyone is signed in. */}
        <Image
          src="/logo-blue.png"
          alt="Zheng He Logistics"
          width={2217}
          height={676}
          className="mb-6 h-11 w-auto"
          priority
        />
        <h1 className="gl-display">Greenlit</h1>
        <p className="gl-body-plain mt-1 text-[color:var(--gl-ink-muted)]">Singapore transport control</p>
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

        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox" checked={stayIn}
            onChange={(event) => setStayIn(event.target.checked)}
            className="h-5 w-5 cursor-pointer accent-[color:var(--gl-accent)]"
          />
          <span className="gl-body-plain text-[color:var(--gl-ink)]">Keep me signed in</span>
        </label>
        <p className="gl-caption -mt-3">
          {stayIn
            ? "You will stay signed in on this device for a month."
            : "You will be signed out when you close the browser. Use this on a shared computer."}
        </p>

        {error ? (
          <p role="alert" className="gl-body-plain rounded-md border border-rose-300 bg-rose-50 p-3 text-[color:var(--gl-state-blocked-ink)]">
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

      <p className="gl-body-plain mt-6 text-[color:var(--gl-ink-muted)]">
        First time here?{" "}
        <a href="/sign-up" className="font-semibold text-[color:var(--gl-accent)] underline underline-offset-4">
          Create your account
        </a>
      </p>

      <p className="gl-caption mt-3">
        Forgotten your password? An administrator can reset it.
      </p>
    </main>
  );
}
