# Moving Greenlit to a VPS

Written for whoever does the move. It is shorter than it looks: most of the
system does not know where it runs, and that was arranged deliberately on the
first day of the project (ADR-0001) before there was a database to defer.

## What does not change

| | Why |
|---|---|
| `packages/engine` | Pure functions. No I/O, no environment, no vendor. All the rules live here. |
| `packages/core` | The `Repository` port, the derivation, the services. Knows nothing about storage. |
| `greenlit-site` UI | React. Runs wherever Node runs. |
| The 15 migrations | Plain Postgres SQL. Nothing Supabase-specific in any of them. |
| ~700 tests | They test the port and the rules, not the vendor. |

## What does change

**One data adapter.** `packages/db/src/supabase.ts` implements the 71-method
`Repository` interface over Supabase's REST API. A VPS implementation does the
same interface over `pg`. Supabase *is* Postgres, so the schema, the SQL and
the migrations all carry over unchanged.

The proof it works is already in the repository: `packages/core/tests/contract.ts`
is one suite run against two implementations — in memory and Supabase. Point it
at a third and it tells you, method by method, whether the new adapter behaves.
Do not write a new test suite for the new adapter. Run that one.

**Authentication — the only real rewrite.** Four files:

    greenlit-site/middleware.ts
    greenlit-site/lib/auth.ts
    greenlit-site/app/sign-in/SignInForm.tsx
    greenlit-site/app/sign-up/SignUpForm.tsx

Supabase Auth is a service rather than a library, so it cannot hide behind the
port the way storage does. What must survive the swap:

- The session carries a **signed** token whose signature is verified, not a
  value read and believed. The current code verifies ES256 locally in about
  1ms; `getSession`-style "read the cookie and trust it" is the bug this
  replaced.
- Identity is **never** taken from a request body or a header a caller could
  set. `authorize()` resolves the principal from the session and the directory.
  There is no `actor` parameter anywhere and there must not be one.
- `canJoin()` runs on **every sign-in**, not only at registration.

**Hosting.** `next build && next start` behind a reverse proxy. There is no
Vercel-specific code: no `@vercel/*` package, no edge runtime. `maxDuration`
on the extract route is a Vercel hint and becomes a proxy timeout instead —
it needs to allow 300 seconds or long document reads will be cut off.

## Three rules that must not be broken

They are enforced by tests, so breaking one fails the build rather than
surfacing months later.

1. **Nothing imports the vendor SDK outside the adapter and those four auth
   files.** `tests/vendor-boundary.test.mjs` fails otherwise. The moment a
   route calls `createClient`, the business rules depend on the vendor and the
   next move becomes a rewrite instead of an adapter.

2. **No route writes its own SQL.** Everything goes through the port. The port
   deliberately exposes no setter for job status, container status, location,
   next action or blocking reason — those are derived (§54, §56). Raw SQL
   exposes every column, including the ones the engine is supposed to own.

3. **The engine and core reach for nothing.** No `fetch`, no `process.env`, no
   filesystem. A rule that reads an environment variable is a rule you cannot
   test without one.

## Suggested order

1. Stand up Postgres. Run `packages/db/migrations/*.sql` in order.
2. Write the `pg` adapter against the `Repository` interface.
3. Run the contract suite against it until it passes. It will find the gaps.
4. Replace auth. Keep the three properties above.
5. Deploy the Next app. Point it at the new adapter.

Storage for documents is the one loose end: the current adapter uses a private
Supabase bucket. On a VPS that becomes a directory or an S3-compatible service,
and it is small — three port methods.
