import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * formatDay guards Intl.format, which throws RangeError("Invalid time value")
 * on an invalid Date rather than degrading. The screen it was on crashed —
 * "Something went wrong on this screen" — for a job that simply had no last
 * free day yet, which is the ordinary state of a job before discharge.
 *
 * Extracted here by evaluating the source, because the component file is JSX
 * and the helpers are module-private. Asserting the behaviour is worth the
 * awkwardness: the failure was a blank screen, not a wrong value.
 */
const src = await readFile(new URL("../GreenlitControlTower.jsx", import.meta.url), "utf8");
const start = src.indexOf("function parseDay(");
const end = src.indexOf("function dayDifference(");
const { formatDay, formatDayShort } = await import(
  "data:text/javascript," + encodeURIComponent(src.slice(start, end) + "\nexport { formatDay, formatDayShort };")
);

test("a real date formats", () => {
  assert.equal(formatDay("2026-09-14"), "14 September 2026");
  // en-SG abbreviates September as "Sept", not "Sep".
  assert.equal(formatDayShort("2026-09-14"), "14 Sept 2026");
  assert.equal(formatDayShort("2026-10-03"), "3 Oct 2026");
});

test("an absent date does not throw", () => {
  // This is the crash: Intl.format(new Date("undefinedT12:00:00+08:00")).
  for (const empty of [undefined, null, "", 0, false]) {
    assert.doesNotThrow(() => formatDay(empty));
    assert.equal(formatDay(empty), "Not set");
  }
});

test("a malformed date does not throw", () => {
  assert.doesNotThrow(() => formatDay("not-a-date"));
  assert.equal(formatDay("not-a-date"), "Not set");
});

test("the caller can say what absence means", () => {
  assert.equal(formatDay(null, "Not discharged yet"), "Not discharged yet");
  assert.equal(formatDayShort(null), "Not scheduled");
});
