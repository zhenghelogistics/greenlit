# 0006 — Packages run TypeScript with no build step

## Context

`@greenlit/engine` and `@greenlit/core` need to be testable quickly, importable
by the app, and movable into the target monorepo without rework. A bundler or
`tsc` emit step for each package adds configuration, output directories and a
watch loop before any of that pays off.

Node 22.6+ executes TypeScript directly by stripping types.

## Decision

Packages ship `.ts` sources with explicit `.ts` extensions on relative imports.
Tests run on `node --test` with no build. `tsc` is used only for `--noEmit`
typechecking. Node 24 is pinned in `.nvmrc`.

## Consequences

- Tests run in about 100ms with nothing to rebuild.
- **Strip-only execution cannot compile code that needs emit.** No TypeScript
  parameter properties, no `enum`, no `namespace`, no decorators. `JobService`
  had to be rewritten to explicit private fields after its constructor
  parameter properties failed to load at all.
- The app needs `allowImportingTsExtensions` in its tsconfig, and a Vite alias
  to resolve the packages across directories. Both are deleted when the
  monorepo's workspaces take over.
- A contributor on Node 20 gets confusing failures; `.nvmrc` is the signpost.

## Status

Accepted.
