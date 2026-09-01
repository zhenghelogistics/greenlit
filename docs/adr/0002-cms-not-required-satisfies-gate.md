# 0002 — CMS `NOT_REQUIRED` satisfies the empty collection gate

## Context

The PRD contradicts itself.

§41 gives the gate as pseudocode:

```
IF cms_required == true AND cms_status != COMPLETED
    RETURN false
```

Read literally, a job whose CMS status is `NOT_REQUIRED` is blocked forever.

§40.2 permits exactly that status: *"`Not Required` is an explicit, permissioned
choice with a mandatory reason."* And Appendix A item 13 records this as a bug
already found once in edition 1.0 — *"making that field unsatisfiable for any
job legitimately exempt from CMS"* — which the unified edition was supposed to
have fixed.

So §41's pseudocode reintroduces a defect its own decision register describes.

## Decision

Implement toward §40.2: **only `PENDING` blocks the gate.** Both `COMPLETED`
and `NOT_REQUIRED` satisfy it.

## Consequences

- Jobs legitimately exempt from CMS can proceed, which is the operational intent.
- The implementation deliberately diverges from a literal reading of §41. This
  is documented in `packages/engine/README.md` and in the gate's own comment,
  so nobody "fixes" it back.
- If operations say a per-job `NOT_REQUIRED` should *not* clear the gate, the
  change is one line — but then §40.2 needs rewording too.

## Status

Accepted, pending confirmation from operations. This is a rule question, not a
coding preference.
