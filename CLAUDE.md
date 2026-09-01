# Project Greenlit — repository conventions

Run `npm run verify` before pushing. It is exactly what CI runs.

## Layout

```
packages/engine   Rules. Pure functions, no framework, no I/O. 54 tests.
packages/core     Services: storage port, derivation, in-memory adapter. 14 tests.
greenlit-site     Next.js app on Cloudflare Workers. 13 tests.
scripts/          Quality gates.
design-system/    MASTER.md is the design authority. v1 kept as superseded.
```

Packages are monorepo-shaped: no framework imports, one public entry point,
no deep imports into `src/`. Moving them into the target monorepo is a
directory move. The Vite alias in `greenlit-site/vite.config.ts` is the only
thing to delete when workspaces take over.

## Rules that are enforced, not just documented

- **Derived values are never writable.** Job status, container status,
  location, next action, blocking reason and waiting-on are computed by
  `@greenlit/engine`. The repository port exposes no setter for any of them,
  by construction (PRD §54, §56).
- **The design system is a build gate.** `npm run design` fails on weight 700+,
  the 16–18px type band, `!important` in components, and emoji as icons.
  See `design-system/project-greenlit/MASTER.md`.
- **Node 24** (`.nvmrc`). Packages run TypeScript directly via Node's
  strip-only execution, so no build step — which is why they cannot use
  TypeScript parameter properties or enums.

## Commits

Attribute solely to the repository owner. Do not add `Co-Authored-By` trailers
or "Generated with" lines.

## Known open items

- `packages/core` uses in-memory dummy data. Supabase replaces it with one new
  `Repository` implementation and no other change.
- The UI still derives its own values for most screens; only the dashboard
  Action Required panel reads the engine-backed API.
- PRD §41 and §40.2 disagree on whether CMS `NOT_REQUIRED` satisfies the empty
  collection gate. Implemented toward §40.2. Needs operations to confirm.
