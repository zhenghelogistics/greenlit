#!/usr/bin/env node
/**
 * macOS " 2" duplicates.
 *
 * File-syncing on macOS resolves a conflict by writing a second copy beside
 * the original — "route 2.ts" next to "route.ts". In source they break the
 * build with duplicate identifiers and double-run every test; under
 * .next/types they do the same to the typecheck while looking like a genuine
 * compiler failure, which is how a clean tree came to produce twenty
 * TS2300s that had nothing to do with the code.
 *
 * Deleting the generated ones and naming the source ones is faster than
 * reading those errors, so this runs first.
 */
import { readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

const SKIP = new Set(["node_modules", ".git"]);
const DUPLICATE = /^(.*) \d+(\.[^.]+)$/;
const GENERATED = /(^|\/)\.next(\/|$)/;

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (DUPLICATE.test(entry)) found.push(path);
  }
  return found;
}

const duplicates = walk(process.cwd());
const generated = duplicates.filter((p) => GENERATED.test(p));
const tracked = duplicates.filter((p) => !GENERATED.test(p));

// Generated duplicates are rebuildable, so clearing them is safe and silent.
for (const path of generated) rmSync(path, { force: true });
if (generated.length) {
  console.log(`Removed ${generated.length} duplicate file(s) under .next/.`);
}

// A duplicate in source is a real problem and is not deleted automatically —
// one of the two copies may hold work that was never merged.
if (tracked.length) {
  console.error(`\nFAIL  ${tracked.length} duplicate source file(s):\n`);
  for (const path of tracked) console.error(`  ${path}`);
  console.error(`
These are macOS sync duplicates. Compare each against the original and delete
it — they break the build with duplicate identifiers and silently double-run
tests. Not removed automatically in case one holds unmerged work.\n`);
  process.exit(1);
}
console.log("No duplicate source files.");
