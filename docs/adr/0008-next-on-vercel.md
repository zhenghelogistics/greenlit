# 0008 — Standard Next.js on Vercel, replacing vinext on Cloudflare Workers

## Context

The app was scaffolded on **vinext** — a Vite-based reimplementation of the
Next.js API surface whose primary deployment target is Cloudflare Workers.
There was no `next` package installed at all; vinext *was* the framework.

Deployment moved to Vercel. Two routes existed:

1. **Keep vinext, add Nitro.** vinext supports other platforms through the
   Nitro Vite plugin. This was built and verified: the Vercel build succeeded
   and emitted correct Build Output API v3.
2. **Migrate to real Next.js.** Vercel is Next's native platform.

Option 1 worked. It was still rejected.

## Decision

Migrate to standard Next.js 15.

The deciding facts:

- **The app was already Next-shaped.** 21 app-router files, and only four
  `next/*` imports — `font/google`, `headers`, `link`, `navigation` — all
  first-class. Very little was actually vinext-specific.
- **vinext says so itself.** Its README: *"Under active development. vinext
  supports substantial Next.js applications today, but it is not yet a drop-in
  replacement for every application or production workload."* That is a
  reasonable thing for a beta to say and a poor thing to have under a
  production deployment.
- **The Nitro path added a second beta to the stack** — vinext plus Nitro plus
  a Vercel preset — where the alternative removes both.

## What changed

- `next@15` installed; `vinext`, `vite`, `nitro`, `@cloudflare/vite-plugin`,
  `@cloudflare/workers-types`, `wrangler`, the Vite RSC plugins and
  `react-server-dom-webpack` removed.
- `vite.config.ts`, `worker/index.ts`, the Cloudflare Sites Vite plugin,
  `env.d.ts` and the D1 scaffolding (`db/`, `drizzle.config.ts`, `examples/`)
  deleted. `db/index.ts` was the only file importing `cloudflare:workers`, and
  nothing imported it — dead scaffolding for a database ADR-0001 already
  decided against.
- `greenlit-site` becomes a workspace member, so `@greenlit/engine` and
  `@greenlit/core` resolve natively instead of through a Vite alias. The alias
  ADR-0006 said would be deleted on monorepo consolidation is now gone.
- `transpilePackages` compiles those two, since ADR-0006 keeps them as
  buildless TypeScript source.

## Consequences

- Vercel is zero-config for the framework; `vercel.json` exists only to build
  from the repo root, which is required because the app imports packages that
  live outside its directory.
- Cloudflare Workers is no longer a deployment target. Reversing this means
  restoring vinext, not a config flag.
- One test asserted against the Cloudflare Worker entry, calling
  `worker.fetch(request, env, ctx)`. That interface is gone; it now reads
  Next's prerendered output. Its status and content-type assertions were
  removed rather than faked, because reading a file asserts neither.
- Image optimisation, caching and ISR now come from Next and Vercel rather
  than from the Workers integration.

## Status

Accepted.
