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

/**
 * The two themes are measured separately, because they are two palettes.
 *
 * A dark mode that borrows the light palette's numbers is where the floor
 * quietly stops applying: #1e40af is a fine link on white and 1.9:1 on a dark
 * ground. Reading the dark block by name means a colour cannot be added there
 * without this checking it too.
 */
const darkBlock = (() => {
  const at = css.indexOf(':root[data-theme="dark"]');
  if (at === -1) throw new Error("no dark theme block in globals.css");
  return css.slice(at, css.indexOf("}", at));
})();

let scope = css;
const tok = (n) => {
  const hex = new RegExp(`--gl-${n}:\\s*(#[0-9a-fA-F]{6})`);
  const m = scope.match(hex) ?? css.match(hex);
  if (!m) throw new Error(`token --gl-${n} not found`);
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

let muted = tok("ink-muted");
let worst = 99, bad = [], n = 0;
const check = (what, fg, bg) => { const v = ratio(fg, bg); n++; if (v < 7) bad.push(`${theme}: ${what} ${v.toFixed(2)}`); worst = Math.min(worst, v); };

// Text has to clear the floor on every ground it can land on, not only the
// page: a token that passes on the page and fails on hover fails for anybody
// who moves a mouse.
const readability = () => {
  for (const ink of ["ink-strong", "ink", "ink-muted", "ink-faint"]) {
    for (const ground of ["bg", "bg-subtle", "bg-hover"]) {
      check(`${ink} on ${ground}`, tok(ink), tok(ground));
    }
  }
  check("accent on bg", tok("accent"), tok("bg"));
  check("accent on raised", tok("accent"), tok("bg-subtle"));
};

let theme = "light";

/**
 * Everything, in both themes.
 *
 * Not a sample: every ink against every ground it can land on, every solid
 * against the type that sits on it, every wash against both the inks that
 * appear on it. A floor that is checked in places is a floor with holes, and
 * the holes are always the pairing nobody thought of — a muted caption on a
 * hover row, a coloured word on a tinted card.
 */
function everything() {
  // 1. Text on every ground.
  for (const ink of ["ink-strong", "ink", "ink-muted", "ink-faint"]) {
    for (const ground of ["bg", "bg-subtle", "bg-hover", "bg-selected", "bg-accent"]) {
      check(`${ink} on ${ground}`, tok(ink), tok(ground));
    }
  }

  // 2. The accent, which is links, the primary action and the focused row.
  for (const ground of ["bg", "bg-subtle", "bg-hover"]) {
    check(`accent on ${ground}`, tok("accent"), tok(ground));
    check(`accent-hover on ${ground}`, tok("accent-hover"), tok(ground));
  }

  // 3. Solids, and the type that sits on them.
  //    Light mode puts white on a dark solid; dark mode puts near-black on a
  //    light one. Same requirement, opposite ink.
  const onSolid = theme === "dark" ? tok("bg") : "#ffffff";
  for (const st of ["state-blocked", "state-warn", "state-ready", "state-idle",
                    "import", "export", "accent",
                    "money", "box", "move", "doc", "past"]) {
    check(`type on ${st}`, onSolid, tok(st));
  }

  // 4. Every hue wash, with both inks that land on it.
  for (const h of ["money", "box", "move", "doc", "past"]) {
    check(`${h}-ink on ${h} wash`, tok(`${h}-ink`), tok(`${h}-soft`));
    check(`muted on ${h} wash`, muted, tok(`${h}-soft`));
    check(`ink on ${h} wash`, tok("ink"), tok(`${h}-soft`));
  }

  // 5. The state inks, which are coloured words on the page rather than pills.
  for (const st of ["state-blocked", "state-warn", "state-ready", "state-idle"]) {
    for (const ground of ["bg", "bg-subtle", "bg-hover"]) {
      check(`${st}-ink on ${ground}`, tok(`${st}-ink`), tok(ground));
    }
  }

  // 6. The attention wash on the dashboard tiles.
  check("warn ink on warn wash", tok("state-warn-ink"), tok("state-warn-soft"));
  check("muted on warn wash", muted, tok("state-warn-soft"));
  check("ink on warn wash", tok("ink"), tok("state-warn-soft"));

  // 7. The rail has its own surface token, because it is a surface rather
  //    than a link: it was painted with the accent, and lightening the accent
  //    for dark mode turned the navy sidebar pale blue under white text.
  check("rail ink on rail", tok("rail-ink"), tok("rail"));
  check("rail muted on rail", tok("rail-muted"), tok("rail"));
  check("rail current on page ground", tok("accent"), tok("bg"));

  // 8. Borders have to be visible, which is a lower bar than text but not
  //    zero: an invisible border is a card with no edge.
  for (const ground of ["bg", "bg-subtle"]) {
    const v = ratio(tok("line"), tok(ground));
    if (v < 1.25) bad.push(`${theme}: line on ${ground} ${v.toFixed(2)} (invisible)`);
    n++;
  }
}

for (const t of ["light", "dark"]) {
  theme = t;
  scope = t === "dark" ? darkBlock : css;
  muted = tok("ink-muted");
  everything();
}

console.log(`  ${n} pairings across light and dark, read out of globals.css`);
console.log(`  lowest ${worst.toFixed(2)}:1  ·  ${bad.length ? "BELOW 7: " + bad.join(", ") : "all clear 7:1"}`);
process.exit(bad.length ? 1 : 0);
