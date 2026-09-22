import { readFileSync, writeFileSync } from "node:fs";
const PATH = "greenlit-site/app/zht.css";
const css = readFileSync(PATH, "utf8");

const norm = (h) => h.length === 4 ? "#" + [...h.slice(1)].map(c => c + c).join("") : h.toLowerCase();
const rgb = (h) => norm(h).match(/\w\w/g).map(x => parseInt(x, 16));
const lum = (h) => { const c = rgb(h).map(x => { const v = x / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60); if (h < 0) h += 360;
  const l = (mx + mn) / 2;
  return [h, d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l];
}
const hsl = (h, s, l) => { const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`; };

/** A light surface's dark counterpart, hue kept so the tint still means something. */
const darkSurface = (hex) => { const [h, s] = toHsl(rgb(hex)); const tint = Math.min(s, .45);
  return tint < .08 ? hsl(h, .06, .115) : hsl(h, .22, .135); };

/** A dark ink's light counterpart, for text that was written for white. */
const lightInk = (hex) => { const [h, s] = toHsl(rgb(hex));
  return s < .08 ? hsl(h, .08, .88) : hsl(h, Math.min(s, .55), .76); };

/** A light border, darkened just enough to stay an edge without glowing. */
const darkLine = (hex) => { const [h, s] = toHsl(rgb(hex)); return hsl(h, Math.min(s, .18), .24); };

const out = [];
let surfaces = 0, inks = 0, lines = 0;

for (const m of css.matchAll(/(\.zht [^{}]*?)\{([^}]*)\}/g)) {
  const body = m[2];
  const selector = m[1].trim().replace(/\s+/g, " ");
  if (selector.includes("data-theme")) continue;
  const decls = [];

  const bg = body.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})/);
  if (bg && lum(bg[1]) > 0.55) { decls.push(`background: ${darkSurface(bg[1])};`); surfaces++; }

  const fg = body.match(/(?:^|[;{\s])color:\s*(#[0-9a-fA-F]{3,6})/);
  if (fg && lum(fg[1]) < 0.35) { decls.push(`color: ${lightInk(fg[1])};`); inks++; }

  for (const b of body.matchAll(/border(-[a-z]+)?(?:-color)?:\s*(?:[\d.]+px\s+\w+\s+)?(#[0-9a-fA-F]{3,6})/g)) {
    if (lum(b[2]) > 0.55) {
      decls.push(`border${b[1] ?? ""}-color: ${darkLine(b[2])};`); lines++;
    }
  }

  if (decls.length) {
    out.push(`  ${selector.split(",").map((s) => s.trim()).join(",\n  ")} { ${decls.join(" ")} }`);
  }
}

const block = `
/* ------------------------------------------------------------------
   His stylesheet in the dark — generated from the rules above, not typed.

   Most of his CSS sets colours as raw hex rather than through his variables,
   so giving the variables dark values left every card, chip, table head,
   button and attention row light. Writing these by hand is how three of them
   end up wrong and nobody notices until a controller is squinting at one.

   Three transforms, each keeping what the colour meant:

   Surfaces keep their hue and a trace of saturation and invert only lightness,
   because his palette carries meaning in the tint — warm for attention, red
   for a problem, blue for a gate. Flattened to grey they would all say the
   same thing.

   Inks written for a white ground are lifted to a light equivalent of the same
   hue, so a red word stays red and becomes readable rather than turning white.

   Borders darken to an edge that is still visible without glowing.

   Regenerate rather than edit. The light rule above is the source of truth.
   ------------------------------------------------------------------ */
:root[data-theme="dark"] {
${out.join("\n")}
}
`;

const marker = "/* ---- generated dark surfaces ---- */";
const at = css.indexOf(marker);
writeFileSync(PATH, (at === -1 ? css : css.slice(0, at)) + marker + block);
console.log(`${out.length} rules: ${surfaces} surfaces, ${inks} inks, ${lines} borders`);

// Spot-check the pairs that matter most on the dashboard.
const check = [["card", "#ffffff", "#17324d"], ["attention row", "#fff8ec", "#173b57"],
               ["danger row", "#fff4f3", "#173b57"], ["gate row", "#f2f7fc", "#173b57"]];
console.log("\nresulting contrast:");
for (const [what, bgHex, fgHex] of check) {
  console.log(`  ${what.padEnd(14)} ${ratio(lightInk(fgHex), darkSurface(bgHex)).toFixed(2)}:1`);
}
