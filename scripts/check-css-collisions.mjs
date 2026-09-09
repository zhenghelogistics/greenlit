#!/usr/bin/env node
/**
 * A design-system class defined twice.
 *
 * `.gl-pill` was the quiet form of a status — a dot and the word, no ground.
 * v5 added a loud form and reused the name. Because the second definition sat
 * later in the file it won the cascade, set `color: #fff` on the quiet form's
 * transparent background, and every status word on the board turned white on
 * white. Nothing failed: the tests passed, the contrast gate passed (it reads
 * tokens, not rules), and the words were simply gone.
 *
 * A second definition of the same class is not always wrong — a media query
 * or a state selector legitimately redefines one. A second *bare* definition
 * of the same class, in the same file, is a collision, and the later one wins
 * silently.
 */
import { readFileSync } from "node:fs";

const file = "greenlit-site/app/globals.css";
const css = readFileSync(file, "utf8");

// Bare class selectors only: `.gl-pill {`, not `.gl-pill::before` or
// `.gl-pill[data-state]` or `.a .gl-pill`.
const seen = new Map();
const lines = css.split("\n");
lines.forEach((line, index) => {
  const match = /^(\.[a-zA-Z][\w-]*)\s*\{/.exec(line.trim());
  if (!match) return;
  const selector = match[1];
  const at = (seen.get(selector) ?? []).concat(index + 1);
  seen.set(selector, at);
});

const collisions = [...seen.entries()].filter(([, at]) => at.length > 1);
if (collisions.length) {
  console.error(`\nFAIL  ${collisions.length} class(es) defined more than once in ${file}:\n`);
  for (const [selector, at] of collisions) {
    console.error(`  ${selector}  lines ${at.join(", ")}`);
  }
  console.error(`
The later definition wins, silently, for every property both set. Rename one,
or fold them together if they genuinely describe the same thing.\n`);
  process.exit(1);
}
/**
 * A design-system class that sets `color`, used beside a Tailwind text colour.
 *
 * globals.css is written after `@import "tailwindcss"`, so a bare `.gl-*`
 * rule that sets `color` beats a `text-white` utility on the same element —
 * same specificity, later in the sheet. `.gl-data` carries color:ink, and on
 * the blue bar that rendered every nav count near-black while the label beside
 * it was white.
 *
 * The fix is a variant of the class without the colour, not `!important`.
 */
const colouredClasses = new Set();
for (const match of css.matchAll(/^(\.gl-[\w-]+)\s*\{([^}]*)\}/gm)) {
  if (/(?:^|[;{\s])color\s*:/.test(match[2])) colouredClasses.add(match[1].slice(1));
}

const component = "greenlit-site/GreenlitControlTower.jsx";
const jsx = readFileSync(component, "utf8");
const conflicts = [];
for (const match of jsx.matchAll(/className=\{?[`"]([^`"]*)[`"]/g)) {
  const classes = match[1];
  const gl = [...colouredClasses].filter((c) => new RegExp(`(^|[\\s\`])${c}([\\s\`$]|$)`).test(classes));
  if (!gl.length) continue;
  if (!/\btext-(?:white|black|\[color:)/.test(classes)) continue;
  const line = jsx.slice(0, match.index).split("\n").length;
  conflicts.push({ line, gl: gl.join(", "), snippet: classes.trim().slice(0, 70) });
}

if (conflicts.length) {
  console.error(`\nFAIL  ${conflicts.length} element(s) set a colour twice:\n`);
  for (const c of conflicts) {
    console.error(`  ${component}:${c.line}  ${c.gl} beside a text colour`);
    console.error(`    ${c.snippet}…`);
  }
  console.error(`
These classes set \`color\` and are defined after Tailwind, so they win. Use a
variant without the colour — .gl-figures is .gl-data without it.\n`);
  process.exit(1);
}

console.log(`No duplicate class definitions in ${file}.`);
console.log(`No colour collisions between ${colouredClasses.size} coloured gl- classes and Tailwind.`);
