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

test("every date is DD/MM/YYYY, because that is what the documents say", () => {
  // This used to assert "14 September 2026". Prettier, and a beat of
  // translation every time a controller compares the screen against a
  // carrier's notice — which is the whole job.
  assert.equal(formatDay("2026-09-14"), "14/09/2026");
  assert.equal(formatDay("2026-10-03"), "03/10/2026");
});

test("both halves are padded, so the column lines up", () => {
  // 1/9 and 11/9 are different lengths of number at a glance; 01/09 and 11/09
  // are not.
  assert.equal(formatDay("2026-01-05"), "05/01/2026");
  assert.equal(formatDay("2026-12-31"), "31/12/2026");
});

test("the weekday form answers when, not merely what date", () => {
  // Used where the question is "when do I have to do this", which a person
  // answers in weekdays.
  assert.equal(formatDayShort("2026-09-14"), "Mon 14/09/2026");
  assert.equal(formatDayShort("2026-10-03"), "Sat 03/10/2026");
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
