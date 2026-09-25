import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

/**
 * A ported screen's class names must exist in the ported stylesheet.
 *
 * This has now happened three times, and each time it reached a person before
 * it reached a test: the New Job tabs rendered as one run-on line of text, the
 * two delivery choices as two bold sentences, and the controller's arrival
 * brief as a column of bare words. In every case the markup was taken from his
 * demo and the rules that draw it were not.
 *
 * It is invisible to everything else in the pipeline. The component compiles,
 * the page renders, the tests pass, the contrast gate reads globals.css and
 * sees nothing wrong — because nothing *is* wrong, except that the browser has
 * no rule for the class and so draws the element as text.
 *
 * So: every class a `.zht` component names must be findable in zht.css.
 */

/** Class names that legitimately have no rule of their own. */
const NOT_OURS = new Set([
  // State classes read by JavaScript rather than drawn, and ones his
  // stylesheet draws only in combination (`.btn.primary`), which the scan
  // below finds under the class it is combined with.
  "active", "current", "open", "selected", "disabled", "hidden",
]);

/**
 * The class names in a component's markup.
 *
 * Only the literal parts. A template literal's `${...}` holes are removed
 * before splitting, because what is inside them is JavaScript — `a.eta`,
 * `rows.length === 1`, a ternary — and none of it is a class name.
 */
function classesIn(source) {
  const found = new Set();
  for (const attribute of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const value = attribute[1] ?? attribute[2] ?? "";

    // The literal text, with each `${...}` hole replaced by a space so the
    // names either side of it do not run together — and then, separately, the
    // quoted strings from inside those holes, because a conditional class
    // (`${active ? " current" : ""}`) is a class like any other.
    const outside = value.replace(/\$\{[^}]*\}/g, " ");
    const inside = [...value.matchAll(/\$\{[^}]*\}/g)].flatMap((hole) => {
      // A comparison's right-hand side is a value, not a class:
      // `${job.addressMode === "job" ? " active" : ""}` names one class, and
      // it is not "job". Drop the comparisons before reading the strings.
      const withoutTests = hole[0].replace(/[\w.[\]]+\s*[!=]==?\s*["'][^"']*["']/g, " ");
      return [...withoutTests.matchAll(/["']([^"']*)["']/g)].map((q) => q[1]);
    });

    for (const token of [outside, ...inside].join(" ").split(/\s+/)) {
      // A trailing dash means the name was completed by an interpolation
      // (`leg--${kind}`), so the fragment is not a class anybody wrote a rule
      // for and the whole family cannot be checked from here.
      if (/^[a-z][a-z0-9-]*[a-z0-9]$/.test(token) && !NOT_OURS.has(token)) found.add(token);
    }
  }
  return found;
}

/** Whether the ported stylesheet draws this class anywhere under `.zht`. */
const drawn = (css, name) =>
  new RegExp(`\\.zht\\s[^{]*\\.${name.replace(/-/g, "\\-")}(?![\\w-])`).test(css);

test("every class a ported screen names is drawn by the ported stylesheet", async () => {
  const css = await readFile("app/zht.css", "utf8");
  const files = (await readdir("components")).filter((f) => /^Zht.*\.jsx$/.test(f));
  assert.ok(files.length >= 4, "expected the ported screens to be found");

  const undrawn = [];
  for (const file of files) {
    const source = await readFile(`components/${file}`, "utf8");
    for (const name of classesIn(source)) {
      if (!drawn(css, name)) undrawn.push(`${file}: .${name}`);
    }
  }

  assert.deepEqual(undrawn, [],
    "these classes are in the markup and have no rule, so they render as bare text");
});

test("the scan reads literal classes and ignores the JavaScript beside them", () => {
  // The guard is only worth having if it reads his markup correctly, and his
  // markup puts expressions inside the same attribute as the class.
  const found = classesIn(
    'className={`arrival-card${a.eta === today ? " today" : ""}`} '
    + 'className="controller-arrival-brief" '
    + 'className={`btn${rows.length === 1 ? " primary" : ""}`}',
  );
  assert.ok(found.has("arrival-card"));
  assert.ok(found.has("controller-arrival-brief"));
  assert.ok(found.has("today"), "a conditional class is still a class");
  assert.ok(found.has("primary"));
  assert.equal(found.has("eta"), false, "a property access is not a class");
  assert.equal(
    classesIn('className={`delivery-mode-btn${mode === "job" ? " active" : ""}`}').has("job"),
    false,
    "a value being compared against is not a class");
  assert.equal(found.has("today ? "), false);
  assert.equal([...found].some((c) => c.includes(".")), false, "no expression fragments");
});

test("every custom property the stylesheets use is defined by one of them", async () => {
  // A `var(--x)` with no `--x` anywhere resolves to nothing, and the
  // declaration is simply dropped. There is no error, no warning and no
  // fallback — the element just renders without whatever that property was.
  //
  // For a colour that is loud and somebody reports it. For `border-radius` it
  // is silent: every corner goes sharp, which looks like a design choice. The
  // radius scale is split across two files on purpose — globals.css defines
  // it because it loads first and Tailwind's @theme reads it at build time,
  // zht.css does the 84 uses — so nothing in either file can see the whole.
  const files = ["app/globals.css", "app/zht.css"];
  const sources = await Promise.all(files.map((f) => readFile(f, "utf8")));
  const all = sources.join("\n");

  // next/font declares its variables on the body element from layout.tsx, so
  // they are genuinely defined and genuinely not in any stylesheet.
  const layout = await readFile("app/layout.tsx", "utf8");
  const defined = new Set([
    ...[...all.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
    ...[...layout.matchAll(/variable:\s*"(--[\w-]+)"/g)].map((m) => m[1]),
  ]);
  const used = new Set([...all.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));

  // A `var(--x, fallback)` states its own default and survives a missing
  // definition, so it is not a fault.
  const withFallback = new Set(
    [...all.matchAll(/var\(\s*(--[\w-]+)\s*,/g)].map((m) => m[1]),
  );

  const undefined_ = [...used].filter((name) =>
    !defined.has(name) && !withFallback.has(name));

  assert.deepEqual(undefined_.sort(), [],
    "these custom properties are used and never defined, so the declarations "
    + "using them are silently dropped");
});
