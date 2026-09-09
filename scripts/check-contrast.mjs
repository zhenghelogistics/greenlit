#!/usr/bin/env node
/**
 * Every v5 pairing, measured against the stylesheet that actually ships.
 *
 * MASTER.md states a 7:1 floor, and a stated floor is worth what it is
 * checked with: v2 claimed a token measured 4.6:1 when it measured 2.9, and
 * three badges shipped at 2.04:1 because the rules in place looked for the
 * wrong shapes. This reads the tokens out of globals.css rather than a list
 * kept beside it, so a colour cannot be changed without this changing too.
 */
import { readFileSync } from "node:fs";
const css = readFileSync("greenlit-site/app/globals.css", "utf8");
const tok = (n) => {
  const m = css.match(new RegExp(`--gl-${n}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --gl-${n} not found in globals.css`);
  return m[1];
};
const lum = (h) => {
  const c = h.match(/\w\w/g).map((x) => {
    const v = parseInt(x, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const muted = tok("ink-muted");
let worst = 99, bad = [], n = 0;
const check = (what, fg, bg) => { const v = ratio(fg, bg); n++; if (v < 7) bad.push(`${what} ${v.toFixed(2)}`); worst = Math.min(worst, v); };

for (const h of ["money", "box", "move", "doc", "past"]) {
  check(`white on ${h}`, "#ffffff", tok(h));
  check(`${h}-ink on wash`, tok(`${h}-ink`), tok(`${h}-soft`));
  check(`muted on ${h} wash`, muted, tok(`${h}-soft`));
}
for (const st of ["state-blocked", "state-warn", "state-ready", "state-idle", "import", "export"]) {
  check(`white on ${st}`, "#ffffff", tok(st));
}
console.log(`  ${n} pairings, read out of globals.css`);
console.log(`  lowest ${worst.toFixed(2)}:1  ·  ${bad.length ? "BELOW 7: " + bad.join(", ") : "all clear 7:1"}`);
process.exit(bad.length ? 1 : 0);
