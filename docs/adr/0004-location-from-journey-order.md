# 0004 — Derive container location from journey order, not status rank

## Context

§24 requires location to be derived from "the most recently progressed
movement". The first implementation read that as *the movement with the
furthest-advanced status*, ranking `COMPLETED` above `DELIVERED`.

That is wrong. A job whose carpark leg is `COMPLETED` and whose port leg is
`DELIVERED` reported the container as still at the carpark — when it had
already reached the port. A completed *earlier* leg outranked a delivered
*later* one.

Caught by a test asserting §24's own requirement that location recomputes when
a movement is edited backwards.

## Decision

Order movements by `movement_ref`, which §18 guarantees ascends within a job
and is never reused, then take the **last leg that actually moved the
container** (status at or beyond `COLLECTED`). Journey order decides; status
rank only distinguishes in-flight from arrived.

## Consequences

- Location is correct across multi-leg journeys: carpark, multi-stop stuffing,
  and the import carpark path of §36.2.
- The rule depends on `movement_ref` being monotonic per job. `nextMovementRef`
  enforces that, including after cancellation.
- Movements in `PENDING`, `READY_FOR_SCHEDULING` or `CANCELLED` are inert and
  never contribute, which is what makes an aborted trip harmless.

## Status

Accepted.
