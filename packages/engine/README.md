# @greenlit/engine

The derivation layer for Project Greenlit. Implements PRD §24, §25, §31, §32,
§37, §41, §44.2, §45 and §47.

## Why this package exists separately

PRD §3 names three values that carry the whole product:

```
current_location          Where is the container right now?
next_action_required      What must happen next?
blocking_reason           What is preventing it?
```

None may ever be typed by a user. Keeping them in a framework-free package is
what makes that enforceable: the app can only *read* them.

## Monorepo move contract

This package is written to be relocated to `packages/engine` in the target
monorepo (§5.3) as a **directory move, with no code change**. That holds
because:

- **No framework imports.** No React, no Next, no database client. `dependencies`
  is empty; the only devDependencies are `typescript` and `@types/node`.
- **One public entry point.** Everything is exported from `src/index.ts`.
  Consumers must import `@greenlit/engine`, never a deep path into `src/`.
- **No I/O.** Every function is pure: stored state in, derived value out. There
  is nothing to re-wire when the data source changes from fixtures to Drizzle.
- **Node-native TypeScript.** Tests run on `node --test` with no build step and
  no bundler assumptions.

The one thing to change on move is the `name` field if the scope differs.

## Running

```
npm test          # node --test, 27 tests
npm run typecheck # tsc --noEmit, strict
```

## Known spec conflict

`canCollectEmpty` resolves a contradiction in the PRD. §41's pseudocode reads
`cms_status != COMPLETED`, which blocks a job whose CMS status is
`NOT_REQUIRED`. §40.2 explicitly permits `NOT_REQUIRED` as a permissioned
choice, and Appendix A item 13 records that the edition 1.0 phrasing made the
rule unsatisfiable for legitimately exempt jobs.

**Implemented toward §40.2: only `PENDING` blocks.** Confirm with operations.
