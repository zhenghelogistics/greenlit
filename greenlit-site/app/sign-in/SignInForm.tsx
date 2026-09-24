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
 *
 * ## The colours
 *
 * The brand guidelines set the ratio — sixty per cent white space, thirty per
 * cent navy, ten per cent Horizon Blue — and this page is the one screen where
 * that composition can actually be honoured, because it has nothing else to
 * do. The navy panel is the thirty.
 *
 * The ten is the part worth being careful with. The guide says Horizon Blue is
 * for buttons, and on a slide that is right; at seventeen pixels on a screen,
 * white on Horizon Blue measures 4.49:1, which is under AA and well under the 7:1
 * this codebase holds itself to. So the button is navy, which measures 11.85:1
 * and which the guide calls the brand's own colour, and Horizon appears where
 * contrast rules do not bite: the focus ring, and the link. That keeps the
 * guide's actual instruction — one blue, marking the one thing to do — while
 * keeping the page legible to somebody signing in at six in the morning.
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

  const field =
    "min-h-12 w-full rounded-lg border border-[color:var(--zhl-line)] bg-white px-3.5 "
    + "text-[17px] text-[color:var(--zhl-ink-navy)] "
    + "focus:border-[color:var(--zhl-horizon)] focus:outline focus:outline-2 "
    + "focus:outline-offset-2 focus:outline-[color:var(--zhl-horizon)]";

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      {/* ---- the form ------------------------------------------------------
          On its own at phone width, and the left half above it. */}
      <div className="flex flex-col justify-center bg-white px-6 py-14 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-[400px]">
          {/* Navy on white. The guide allows exactly two pairings and this is
              one of them; the reverse sits on the panel opposite. */}
          <Image
            src="/logo-blue.png"
            alt="Zheng He Logistics"
            width={2217}
            height={676}
            className="h-10 w-auto"
            priority
          />

          <h1 className="mt-10 text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] text-[color:var(--zhl-ink-navy)]">
            Sign in
          </h1>
          <p className="mt-2 text-[17px] text-[color:var(--zhl-harbor)]">
            Singapore transport control.
          </p>

          <form onSubmit={submit} className="mt-9 grid gap-5">
            <label className="grid gap-2">
              <span className="text-[15px] font-medium text-[color:var(--zhl-ink-navy)]">Email</span>
              <input
                type="email" required autoComplete="username" value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={field}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[15px] font-medium text-[color:var(--zhl-ink-navy)]">Password</span>
              <input
                type="password" required autoComplete="current-password" value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={field}
              />
            </label>

            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox" checked={stayIn}
                onChange={(event) => setStayIn(event.target.checked)}
                className="h-5 w-5 cursor-pointer accent-[color:var(--zhl-horizon)]"
              />
              <span className="text-[17px] text-[color:var(--zhl-ink-navy)]">Keep me signed in</span>
            </label>
            {/* Ink rather than Harbor Gray: this line changes what happens on a
                shared machine, so it is not supporting copy. Harbor Gray is
                5.46:1 on white — fine for a caption, thin for a consequence. */}
            <p className="-mt-3 text-[15px] text-[color:var(--zhl-ink-navy)]">
              {stayIn
                ? "You will stay signed in on this device for a month."
                : "You will be signed out when you close the browser. Use this on a shared computer."}
            </p>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-[color:var(--zhl-error-line)] bg-[color:var(--zhl-error-soft)] p-3 text-[17px] text-[color:var(--zhl-error)]"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit" disabled={busy}
              className="min-h-12 rounded-lg border-0 bg-[color:var(--zhl-navy)] px-5 text-[17px]
                font-semibold text-white transition-opacity hover:opacity-90
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-[color:var(--zhl-horizon)] disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-7 text-[17px] text-[color:var(--zhl-harbor)]">
            First time here?{" "}
            <a
              href="/sign-up"
              className="font-semibold text-[color:var(--zhl-horizon-ink)] underline underline-offset-4"
            >
              Create your account
            </a>
          </p>
          <p className="mt-3 text-[15px] text-[color:var(--zhl-harbor)]">
            Forgotten your password? An administrator can reset it.
          </p>
        </div>
      </div>

      {/* ---- the navy ------------------------------------------------------
          The brand's thirty per cent. Hidden below `lg`, where a full-height
          colour field would push the form off a phone screen for decoration.

          What is on it is deliberately almost nothing. The reference this was
          modelled on fills its panel with floating avatars; a transport
          control tower has no reason to, and the guide asks for one idea at a
          time. So: the mark, one line, and a quiet grid that reads as a
          manifest rather than as ornament. */}
      <div
        aria-hidden="true"
        className="relative hidden overflow-hidden lg:block"
        style={{ backgroundColor: "var(--zhl-navy)" }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),"
              + "linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(120% 90% at 70% 35%, #000 35%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(120% 90% at 70% 35%, #000 35%, transparent 78%)",
          }}
        />
        {/* One Horizon mark, low and quiet: the ten per cent, as a horizon. */}
        <div
          className="absolute inset-x-0 bottom-0 h-[38%]"
          style={{
            background:
              "linear-gradient(to top, color-mix(in srgb, var(--zhl-horizon) 30%, transparent), transparent)",
          }}
        />

        <div className="relative flex h-full flex-col justify-end p-16">
          <Image
            src="/logo-blue.png"
            alt=""
            width={2217}
            height={676}
            // White on navy: the guide's other permitted pairing, made from the
            // one asset rather than shipping a second file that can drift.
            className="h-9 w-auto brightness-0 invert"
          />
          <p className="mt-7 max-w-[26ch] text-[30px] font-semibold leading-[1.22] tracking-[-0.015em] text-white">
            Every container, and what it is waiting for.
          </p>
          <p className="mt-4 max-w-[42ch] text-[17px] leading-relaxed text-[color:var(--zhl-on-navy-muted)]">
            Import and export, from the arrival notice to the empty going back.
          </p>
        </div>
      </div>
    </main>
  );
}
