import Link from "next/link";

/** A job number that does not resolve should say so, not render an empty shell. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center gap-4 px-4">
      <h1 className="gl-title">That record does not exist.</h1>
      <p className="gl-body gl-muted">
        It may have been closed, or the reference may be mistyped. Search from
        the dashboard to find it.
      </p>
      <Link
        href="/"
        className="flex h-10 w-fit items-center rounded border border-slate-300 bg-white px-4 text-[15px] font-medium text-slate-700 hover:bg-slate-50"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
