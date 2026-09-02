#!/usr/bin/env node
/**
 * Spec coverage report.
 *
 * The PRD is numbered and precise, and the code already cites section numbers
 * in comments. This turns that convention into a measurement: for every
 * numbered section, is there implementing code, and is there a test?
 *
 * It answers "are we building what we said we would" without anyone having to
 * re-read 60,000 words.
 *
 * Usage: node scripts/spec-coverage.mjs [--json] [--min <percent>]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PRD = join(ROOT, "docs/PRD.md");
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".wrangler", ".vinext", "tmp", ".agents", "docs"]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

/**
 * Sections that do not want implementing code, so counting them as gaps would
 * make the number meaningless. Two kinds:
 *   narrative  - prose framing, no behaviour to implement
 *   deferred   - real behaviour, explicitly out of MVP scope or prototype-owned
 */
const NARRATIVE = new Set([
  "0",  // edition changelog
  "1",  // product overview
  "2",  // business problem
  "3",  // objective and success definition
  "4",  // scope
  "5",  // build approach
  "6",  // structural difference, explanatory
  "8",  // core data architecture, expressed as types
  "16", // operating model, explanatory
]);
const DEFERRED = new Set([
  "14", // non-functional, partly process
  "15", // navigation conventions, prototype-owned
  "48", "49", "50", "51", "52", "53", // screens, prototype-owned
  "59", "60", "61", // acceptance, sequencing, definition of done
]);
const OUT_OF_SCOPE = new Set([...NARRATIVE, ...DEFERRED]);

function sections() {
  const text = readFileSync(PRD, "utf8");
  const out = new Map();
  // "## 27. Exceptions" and "### 27.4 Manual override rules"
  for (const m of text.matchAll(/^#{2,4}\s+(\d+(?:\.\d+)*)\.?\s+(.+)$/gm)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE_EXT.has(extname(full))) out.push(full);
  }
  return out;
}

const cited = { code: new Map(), test: new Map() };
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const bucket = /test|spec/i.test(rel) ? cited.test : cited.code;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const m of text.matchAll(/§(\d+(?:\.\d+)*)/g)) {
    const key = m[1];
    if (!bucket.has(key)) bucket.set(key, new Set());
    bucket.get(key).add(rel);
  }
}

/** A parent counts as covered if any of its subsections is. */
const covers = (map, id) =>
  map.has(id) || [...map.keys()].some((k) => k.startsWith(`${id}.`));

const all = sections();
const rows = [];
for (const [id, title] of all) {
  if (id.includes(".")) continue; // report at top-level section granularity
  const scope = NARRATIVE.has(id) ? "narrative" : DEFERRED.has(id) ? "deferred" : "mvp";
  const inCode = covers(cited.code, id);
  const inTest = covers(cited.test, id);
  rows.push({
    id: Number(id), title, scope,
    // A section is claimed if code addresses it OR a test asserts it. Some
    // sections are cross-cutting checklists (§57) with no source file of their
    // own; a suite that enforces them is a real claim, not an absence.
    code: inCode || inTest,
    test: inTest,
    sourceOnly: inCode && !inTest,
  });
}
rows.sort((a, b) => a.id - b.id);

const mvp = rows.filter((r) => r.scope === "mvp");
const implemented = mvp.filter((r) => r.code);
const tested = mvp.filter((r) => r.code && r.test);
const pct = (n) => mvp.length ? Math.round((n / mvp.length) * 100) : 0;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows, implemented: implemented.length, tested: tested.length, total: mvp.length }, null, 2));
} else {
  console.log("Spec coverage — docs/PRD.md\n");
  console.log(`  MVP sections        ${mvp.length}`);
  console.log(`  With code           ${implemented.length}  (${pct(implemented.length)}%)`);
  console.log(`  With code and test  ${tested.length}  (${pct(tested.length)}%)`);
  console.log(`  Deferred / narrative ${rows.length - mvp.length}\n`);
  console.log("  Unclaimed MVP sections:");
  const gaps = mvp.filter((r) => !r.code);
  if (!gaps.length) console.log("    (none)");
  for (const r of gaps) console.log(`    §${r.id}  ${r.title}`);
  const untested = mvp.filter((r) => r.code && !r.test);
  if (untested.length) {
    console.log("\n  Implemented but not cited by any test:");
    for (const r of untested) console.log(`    §${r.id}  ${r.title}`);
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  const line = (r) => `| §${r.id} | ${r.title} | ${r.code ? "✅" : "—"} | ${r.test ? "✅" : "—"} | ${r.scope} |`;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Spec coverage\n\n**${implemented.length}/${mvp.length} MVP sections implemented (${pct(implemented.length)}%), ${tested.length} with tests.**\n\n` +
    `| Section | Title | Code | Test | Scope |\n|---|---|---|---|---|\n${rows.map(line).join("\n")}\n`);
}

const minIdx = process.argv.indexOf("--min");
if (minIdx !== -1) {
  const min = Number(process.argv[minIdx + 1]);
  if (pct(implemented.length) < min) {
    console.error(`\nFAIL  implementation coverage ${pct(implemented.length)}% is below the floor of ${min}%`);
    process.exit(1);
  }
}
