# 0005 — Portnet processing warns; it never blocks the laden gate

## Context

§44.2.1 states that a container can be genuinely ready, with VGM received, and
still not be processed by Portnet — usually for carrier-side reasons outside
our control. All four combinations of VGM and Portnet state occur in practice
and none is a data error.

The tempting implementation is to add Portnet to the laden gate beside
container number, ready and VGM.

## Decision

Portnet state is recorded and raises a *Portnet not processed* exception at
Medium severity, but it is **not** a condition of `canStartLaden`.

## Consequences

- A controller can still create and schedule the movement when the customer
  asks, which is a decision that is not ours to refuse.
- This is the second place the system deliberately warns instead of blocking,
  after chassis availability (§35.4). Both share a reason: the blocking
  condition is outside our control, so a gate would be overridden routinely —
  and a gate that is routinely overridden teaches people to ignore every other
  gate in the system.
- Portnet failures are visible but never stall the operation.

## Status

Accepted.
