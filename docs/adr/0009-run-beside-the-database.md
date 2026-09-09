# ADR-0009: Run the functions beside the database

**Status:** Accepted
**Date:** 2026-09-09

## Context

The board took about 400ms locally after the N+1 was removed, and the floor
turned out to be network: a single round trip to Supabase measures 110-160ms,
while ping reaches the edge in 6ms. The distance is to wherever the project is
hosted, which is Tokyo.

`vercel.json` set no region, so functions ran in Vercel's default, `iad1`
(Washington DC). Every database query therefore crossed the Pacific — Virginia
to Tokyo and back — on a path where the application makes several round trips
per request.

## Decision

Pin functions to `hnd1` (Tokyo), beside the database.

The alternative was `sin1` (Singapore), nearest the people using it. It is the
wrong trade for this application. A request costs one browser-to-function hop
and several function-to-database hops, so the hops to optimise are the
database ones:

| | browser hop | database hops | total |
|---|---|---|---|
| `hnd1` beside the database | ~70ms once | ~5ms × 7 | ~105ms |
| `sin1` beside the users | ~5ms once | ~70ms × 7 | ~495ms |

Co-location with the database wins while a request reads more than once, and
this one always does: a board reads jobs, then their containers, movements and
exceptions.

## Consequences

Moving the Supabase project to Singapore later would make `sin1` correct
instead, and this decision should be revisited together with that — the pairing
is what matters, not either region on its own.

If a future request pattern becomes single-read and latency-sensitive from the
browser, the trade flips. That is not the shape of this application today.
