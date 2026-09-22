import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * Which files are allowed to know who the vendor is.
 *
 * The whole system is portable except for a named handful of files, and that
 * is not an accident — ADR-0001 defined the Repository port on the first day
 * of the project, before there was a database to defer. Two implementations
 * already exist and the same contract suite runs against both, so moving to a
 * third store is writing one adapter rather than rewriting the application.
 *
 * That property is only true while it stays true. One `createClient` in a
 * route handler is all it takes: the business rules start depending on the
 * vendor, the contract suite stops covering the real path, and the next store
 * becomes a rewrite instead of an adapter. This fails the build when that
 * happens, so nobody has to remember.
 */
const ALLOWED = new Set([
  // The data adapter. This is the port's other implementation.
  "packages/db/src/supabase.ts",
  "packages/db/src/seed.ts",
  // Authentication. Supabase Auth is a service rather than a library, so it
  // cannot hide behind the port the way storage does. These four are the
  // known cost of that, and the list exists so the number stays four.
  "greenlit-site/middleware.ts",
  "greenlit-site/lib/auth.ts",
  "greenlit-site/app/sign-in/SignInForm.tsx",
  "greenlit-site/app/sign-up/SignUpForm.tsx",
]);

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", ".vinext", "tmp", ".agents"]);
const ROOT = new URL("../../", import.meta.url).pathname;

async function sources(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await sources(full, out);
    else if (/\.(ts|tsx|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = await sources(ROOT);

test("only the adapter and the auth files know the vendor's name", async () => {
  const leaks = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (ALLOWED.has(rel) || rel.includes("tests/")) continue;
    const src = await readFile(file, "utf8");
    if (/@supabase\//.test(src)) leaks.push(rel);
  }
  assert.deepEqual(leaks, [],
    "these import the vendor SDK outside the adapter, which is how a port "
    + "stops being a port:\n  " + leaks.join("\n  "));
});

test("the rules and the services stay ignorant of storage entirely", async () => {
  // Stronger than the vendor check: the engine and core must not reach the
  // outside world at all. A rule that reads an environment variable or opens
  // a connection is a rule that cannot be tested without one.
  const offenders = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (!/^packages\/(engine|core)\/src\//.test(rel)) continue;
    const src = await readFile(file, "utf8");
    for (const [what, pattern] of [
      ["fetch", /\bfetch\(/], ["process.env", /process\.env/],
      ["a client", /createClient/], ["the filesystem", /\bfrom ['"]node:fs/],
    ]) {
      if (pattern.test(src)) offenders.push(`${rel} reaches for ${what}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("every route reaches the database through the port", async () => {
  // A route that builds its own SQL bypasses the port and, with it, §54: the
  // port deliberately exposes no setter for a derived value, and raw SQL
  // exposes every column.
  const offenders = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (!rel.startsWith("greenlit-site/app/api/")) continue;
    const src = await readFile(file, "utf8");
    if (/\bfrom\(['"`]\w+['"`]\)|SELECT .* FROM |INSERT INTO /i.test(src)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [],
    "a route writing its own queries can set values the engine is supposed to derive");
});
