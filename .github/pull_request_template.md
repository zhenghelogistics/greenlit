## What this changes

<!-- One or two sentences. What behaviour is different afterwards? -->

## PRD sections

<!-- Which numbered sections does this implement or change? Cite them in the
     code too — `npm run spec` reports on those citations. -->

## How it was verified

<!-- Name the proof. "Tests pass" is not a proof; "the §44.2 laden gate now
     rejects a container with no VGM, covered by tests/engine.test.ts" is. -->

## Checklist

- [ ] `npm run verify` passes locally
- [ ] New behaviour has a test that would fail without the change
- [ ] PRD sections cited in code comments
- [ ] No derived value became writable (§54)
- [ ] Design system gate passes; no new raw hex or 700-weight
- [ ] If a non-obvious decision was made, an ADR is added under `docs/adr/`
- [ ] If derived output changed, `golden.json` diff was read and is intended
