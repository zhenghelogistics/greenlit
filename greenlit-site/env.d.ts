/**
 * Cloudflare binding declarations.
 *
 * `cloudflare:workers` exports `env` as `Cloudflare.Env`, which ships empty —
 * each project declares its own bindings. worker/index.ts already expects DB
 * and ASSETS at runtime; this makes them visible to the typechecker so a
 * missing or misspelled binding fails the build instead of at request time.
 */
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
  }
}
