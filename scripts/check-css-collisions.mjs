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
console.log(`No duplicate class definitions in ${file}.`);
