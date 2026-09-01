"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * §14.4: automation failures must never disappear silently. A controller
 * mid-shift needs to know what broke and how to get back to work, not a blank
 * page. The reset button re-renders the segment without a full reload, so
 * unsaved context elsewhere survives.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured enough to correlate with a server log line.
    console.error("[greenlit] route error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center gap-4 px-4">
      <h1 className="gl-title">Something went wrong on this screen.</h1>
      <p className="gl-body gl-muted">
        The rest of the control tower is unaffected. Try again, and if it keeps
        happening, quote the reference below.
      </p>
      <p className="gl-data gl-muted">
        {error.digest ? `Reference ${error.digest}` : error.message}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="h-10 rounded border-0 bg-[color:var(--gl-brand)] px-4 text-[15px] font-medium text-white hover:bg-[color:var(--gl-brand-hover)]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="flex h-10 items-center rounded border border-slate-300 bg-white px-4 text-[15px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
