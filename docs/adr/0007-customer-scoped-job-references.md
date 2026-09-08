# 0007 — Customer-scoped job references, replacing §8.1 job numbers

## Context

§8.1 specifies:

```
JOB-YYMMDD-XXX        import        JOB-260817-001
EXP-YYMMDD-XXX        export        EXP-260817-001
```

A global daily sequence per domain. That shape suits an operation taking work
from a wide, changing set of customers, where the date is the most useful thing
to carry in a reference.

Zhenghe does not work that way. The customer base is **retainer**, not
transactional: the same companies ship repeatedly, and the operation is
organised around the company rather than around the day. Controllers think
"what is ABC Company running this week", not "what came in on the 17th".

Under §8.1's format nothing in the reference says whose job it is, so grouping
a customer's work requires a filter every time, and a reference read aloud on
the phone carries no useful context.

## Decision

Job references become **customer-scoped**:

```
ABC-001, ABC-002, ABC-003        ABC Company's jobs, in the order they happened
LCT-001                          Lion City Traders' first job
```

- The customer code is 2–6 letters, chosen by a person, validated unique, and
  **immutable once issued** — every reference already printed depends on it.
- One running sequence per customer, covering **both domains**. Opening a
  company shows its jobs in the order they happened rather than two interleaved
  sequences; the trade direction is a property of the job, shown beside the
  reference.
- The sequence does not reset by date. The created date is stored and
  displayed; it is no longer encoded in the reference.
- The sequence widens past 999 rather than wrapping.

Companies become a navigation entry point: open a company, see its jobs.

## What §8.1 guaranteed, and what survives

| §8.1 guarantee | Status |
|---|---|
| System generated | Kept |
| Unique | Kept — the code namespaces the sequence |
| Immutable after creation | Kept, and extended to the customer code |
| Domain distinguishable from the reference | **Dropped** — domain is a field, not a prefix |
| Date readable from the reference | **Dropped** — the created date is stored instead |
| Two independent domain sequences | **Replaced** by one sequence per customer |

The two dropped properties are the cost. Losing the date from the reference
means sorting relies on the stored date, which it should anyway. Losing the
domain prefix means a reference alone does not say import or export, which
matters when one is quoted without context — in exchange, it always says whose
job it is, which is the question asked far more often here.

## Consequences

- §57 rules P-1 and 2.1-1 still hold, and their tests were rewritten against
  the new format rather than deleted: numbers remain system-generated, unique
  and immutable.
- A customer master becomes required infrastructure rather than optional
  reference data. §9 already specified one; it is now load-bearing.
- Existing references in the fixtures (`JOB-260818-001`) are the old format.
  Nothing migrates them, because no real data exists yet. Once it does, a
  migration must preserve old references verbatim — they are immutable, and
  reissuing them would break every document already sent.
- `parseJobReference` deliberately returns null for the old format, so the two
  can never be confused.

## Status

Accepted, superseding §8.1's format. The PRD text is unchanged; this record is
the authority for the divergence.
