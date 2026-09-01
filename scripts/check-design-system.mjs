#!/usr/bin/env node
/**
 * Design system gate.
 *
 * MASTER.md v2 is only worth writing if it is enforced. Every rule here maps to
 * a specific clause, and each one exists because the violation actually
 * happened in this repository — v1 accumulated all of them silently.
 *
 * Usage: node scripts/check-design-system.mjs [--json]
 * Exit 1 on any error-level finding.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".wrangler", ".vinext", "tmp", ".agents"]);
const UI_EXT = new Set([".jsx", ".tsx"]);

/** Files that define the tokens themselves are exempt from the palette rule. */
const TOKEN_FILES = [/globals\.css$/, /MASTER.*\.md$/];

const RULES = [
  {
    id: "weight-ceiling",
    clause: "§2.3",
    level: "error",
    applies: (f) => UI_EXT.has(extname(f)),
    pattern: /\bfont-(bold|extrabold|black)\b/g,
    message: "Weight 700+ is not in the system. Only 400/500/600.",
  },
  {
    id: "type-collapse",
    clause: "§2.2",
    level: "error",
    applies: (f) => UI_EXT.has(extname(f)),
    // The exact band v1 collapsed into. Body is 15px; labels are 12px.
    pattern: /text-\[1[678]px\]|(?<![\w-])text-base(?![\w-])/g,
    message: "16-18px is the band v1 collapsed into. Use 15px body, 13px caption or 12px label.",
  },
  {
    id: "important-override",
    clause: "§0",
    level: "error",
    applies: (f) => UI_EXT.has(extname(f)),
    pattern: /!important/g,
    message: "An !important in a component masks a markup problem instead of fixing it.",
  },
  {
    id: "emoji-icon",
    clause: "§11",
    level: "error",
    applies: (f) => UI_EXT.has(extname(f)),
    pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
    message: "Emoji are not icons. Use Lucide.",
  },
  {
    id: "raw-hex",
    clause: "§3",
    level: "warn",
    applies: (f) => UI_EXT.has(extname(f)),
    pattern: /#[0-9a-fA-F]{6}\b/g,
    message: "Raw hex bypasses the palette. Use a --gl- token.",
  },
  {
    id: "left-behind-log",
    clause: "hygiene",
    level: "warn",
    applies: (f) => [".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(extname(f))
      && !f.includes("test") && !f.startsWith("scripts/"),
    pattern: /console\.(log|debug)\(/g,
    message: "Debug logging left in source.",
  },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (TOKEN_FILES.some((r) => r.test(rel))) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }

  for (const rule of RULES) {
    if (!rule.applies(rel)) continue;
    const matches = [...text.matchAll(rule.pattern)];
    if (!matches.length) continue;
    const lines = new Set(matches.map((m) => text.slice(0, m.index).split("\n").length));
    findings.push({
      rule: rule.id, clause: rule.clause, level: rule.level,
      file: rel, count: matches.length,
      lines: [...lines].slice(0, 5), message: rule.message,
    });
  }
}

const errors = findings.filter((f) => f.level === "error");
const warns = findings.filter((f) => f.level === "warn");

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ errors, warns }, null, 2));
} else {
  const line = (f) =>
    `  ${f.file}:${f.lines.join(",")}  [${f.rule} ${f.clause}] x${f.count}\n      ${f.message}`;
  console.log("Design system gate — MASTER.md v2\n");
  if (errors.length) { console.log(`FAIL  ${errors.length} error group(s):`); errors.forEach((f) => console.log(line(f))); console.log(""); }
  if (warns.length) { console.log(`WARN  ${warns.length} warning group(s):`); warns.forEach((f) => console.log(line(f))); console.log(""); }
  if (!errors.length && !warns.length) console.log("PASS  no violations.");
  else if (!errors.length) console.log("PASS  warnings only.");
}

// GitHub Actions job summary, when running in CI.
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = findings.map((f) =>
    `| ${f.level === "error" ? "❌" : "⚠️"} | \`${f.file}\` | ${f.rule} | ${f.clause} | ${f.count} |`).join("\n");
  const body = `### Design system gate\n\n` +
    (findings.length
      ? `| | File | Rule | Clause | Count |\n|---|---|---|---|---:|\n${rows}\n`
      : `No violations.\n`);
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);
}

process.exit(errors.length ? 1 : 0);
