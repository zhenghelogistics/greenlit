# 0003 — Replace the design system rather than patch it

## Context

The interface was described as visually poor. The first hypothesis — that the
app had failed to implement `MASTER.md` v1 — was wrong: the tokens were present
and correct.

An audit of the implementation found the cause in the specification itself:

| Finding | Measurement |
|---|---|
| Text inside a single 2px band (16–18px) | 132 of 173 uses, **76%** |
| `font-semibold` share of all weights | 171 of 220, **78%** |
| Distinct elevation levels available | **1** |
| Horizontal paddings for like containers | **4** |

v1 mandated this directly: 18px operational body, 16px compact minimum,
hierarchy ceiling 600, no resting shadow. There was **no type level below
16px**, so labels, captions and body text were forced to the same size. Nothing
could be emphasised because everything already was.

v1 also specified touch sizing (18px body, 44px targets) for a product whose
own responsive contract names 1440px+ as primary and whose core screen is a
dense operational table.

## Decision

Replace `MASTER.md` with v2, "operational instrument". Keep the ink-navy shell,
brand blue, semantic colour discipline and no-ornament rule. Replace the type
system (six steps), weight discipline (400/500/600), elevation (three levels),
density (two tiers) and spacing rhythm.

Add a mono face for machine-generated values so digits align and transpositions
are visible.

Enforce the result with `scripts/check-design-system.mjs` in CI, because a
design system that is not a build gate decays back into whatever was easiest.

## Consequences

- The approved 19 Aug screenshots are stale and need recapturing.
- v1 is retained as `MASTER.v1-superseded.md`; it was a deliberate document.
- Enforcement found four violations by hand-editing alone, including a stale
  1,611-line duplicate component and 60 places still using the v1 brand hex.
- A future rule change means updating both the document and the gate.

## Status

Accepted.
