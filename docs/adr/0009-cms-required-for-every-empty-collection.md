# 0009 — CMS is required for every empty collection

Supersedes [0002](0002-cms-not-required-satisfies-gate.md).

## Context

ADR-0002 recorded a contradiction between §41 and §40.2 and resolved it toward
§40.2: `NOT_REQUIRED` released the empty collection gate, on the reading that a
status which satisfies nothing is a status that strands the job it is set on.
It was accepted pending confirmation, because it is a rule question.

Operations answered on 24 September 2026, and answered a wider question than
the one asked:

> **Import:** there should not be a CMS required in the first place, so you can
> remove that.
>
> **Export:** CMS is required for all empty collections to proceed. Before
> planning, the controller must ensure that this job's CMS is done before he
> can assign a driver to go down and collect the container.

So there is no exempt export job. The CMS is what authorises the collection.

## Decision

**Only `COMPLETED` releases the gate.** `NOT_REQUIRED` satisfies nothing.

`NOT_REQUIRED` stays in the enum, because rows already carry it, and it is no
longer offered on any form. A status nobody can choose cannot strand a new job,
and the jobs that already hold it now read as *Awaiting CMS* — which is true,
and is the only way anybody finds them. That is the whole of ADR-0002's
concern, met by removing the choice rather than by honouring it.

Separately, planning is refused rather than warned. `refuseEmptyCollection`
stops an `EMPTY_COLLECTION` movement being created while the CMS is
outstanding, enforced in both adapters rather than in the route, so it holds
for every caller.

This is the one place the warn-don't-block principle does not apply, and
deliberately. Elsewhere the odd-looking answer is sometimes the true one — a
container number of the wrong shape, a delivery date before the ETA. Here there
is no case where sending the driver anyway is correct, so there is nothing for
an override to express.

## Consequences

- §41's pseudocode is now the implemented rule. §40.2 is the wording that needs
  amending, not ours — it describes a permissioned choice that operations say
  does not exist.
- Import carries no CMS field anywhere, including on the job detail, where it
  had been showing for both domains.
- Any export job sitting on `NOT_REQUIRED` becomes visible as Awaiting CMS at
  the next read. That is intended: each one is a job whose CMS nobody has done.

## Status

Accepted. Confirmed by operations, so unlike ADR-0002 this is settled rather
than provisional.
