# 0001 — Storage port with an in-memory adapter; defer the database

## Context

The app ships with Drizzle configured for SQLite and a `D1Database` binding
already declared in the worker. The PRD's §55 lists the tables. But the team
intends to use **Supabase**, which is Postgres.

Building the SQLite schema now would produce migrations, column types and
constraints that Postgres shapes differently — work that would be thrown away.
Building nothing would leave the engine untestable end to end.

## Decision

Define a `Repository` interface in `@greenlit/core` and implement it once, in
memory, with fixtures drawn from the PRD's worked examples (§58).

Two constraints make the interface a real port rather than a convenience:

1. **Every method is async.** A synchronous port against a `Map` would force a
   rewrite of every caller the day a real query appears.
2. **No storage type crosses the boundary.** No Drizzle row, no Postgres
   client, no Supabase envelope — only domain records.

The port exposes **no setter for any derived value**, which enforces PRD §54
structurally rather than by convention.

## Consequences

- Supabase arrives as one new file implementing `Repository`. Nothing else moves.
- The claim is verified, not hoped: `tests/contract.ts` is written against the
  interface, and any adapter must pass it unchanged.
- Data does not survive a restart. Acceptable while fixtures are dummy data;
  blocking before any real use.
- Migrations, indexing and query performance are entirely unexplored. The port
  says nothing about how expensive an implementation might be.

## Status

Accepted. Revisit when Supabase credentials exist.
