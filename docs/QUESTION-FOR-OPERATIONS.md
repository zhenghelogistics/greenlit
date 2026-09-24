# One rule question on export jobs: CMS marked "Not Required"

We need a decision from operations before this can be considered settled. It is
a business rule, not a technical preference, and the specification answers it
two different ways.

## What the rule does

Every export job carries a CMS status. It can be one of three things:

- **Pending** — CMS still has to be done
- **Completed** — CMS has been done
- **Not Required** — this job is exempt, chosen deliberately, with a written
  reason

Separately, there is a gate: **an export job cannot move to empty collection
until CMS is settled.** That gate is what stops a truck being sent for an empty
container on a job that is not cleared to have one.

## The contradiction

**§41** states the gate as: *if CMS is required and the status is not
"Completed", stop.*

**§40.2** states that *"Not Required" is an explicit, permissioned choice with a
mandatory reason.*

Put together, those two say that a job someone has deliberately marked as exempt
is stopped at the gate — and it can never get past it, because "Not Required"
will never become "Completed". The job is blocked permanently, and the only way
out is to mark it Completed for work that was never required, which makes the
record untrue.

This is not a new observation. Appendix A, item 13 records it as a defect found
in edition 1.0, described there as *"making that field unsatisfiable for any job
legitimately exempt from CMS"*. The unified edition was meant to have fixed it,
and §41's wording still carries it.

## What we have built, and why

**Only "Pending" holds a job at the gate. Both "Completed" and "Not Required"
release it.**

We chose this because it is the only reading under which the "Not Required"
status does anything at all, and because the decision register already
identifies the alternative as a bug.

## The question

> **When someone marks an export job's CMS as "Not Required", with a reason,
> should that job be free to proceed to empty collection?**

If **yes** — we are correct as built, and §41 needs rewording so the next person
reading the specification does not undo it.

If **no** — we change it, and we need to know the intended route for a job that
is genuinely exempt from CMS. Specifically: what is such a job supposed to be
marked as, so that it can proceed?

## What is affected

Export jobs only, and only those marked exempt. Jobs where CMS is genuinely
pending or genuinely completed behave the same either way.

Changing the answer is a small change on our side. Knowing it is right is the
part that matters, because the failure is silent in both directions: too strict
and a legitimate job sits stuck with no one sure why; too loose and a truck is
sent for an empty on a job that was not cleared.
