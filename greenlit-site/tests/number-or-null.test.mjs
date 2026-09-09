import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const src = await readFile(new URL("../GreenlitControlTower.jsx", import.meta.url), "utf8");
const start = src.indexOf("function numberOrNull(");
const end = src.indexOf("function parseDay(");
const { numberOrNull } = await import(
  "data:text/javascript," + encodeURIComponent(src.slice(start, end) + "\nexport { numberOrNull };")
);

test("a bare number parses", () => {
  assert.equal(numberOrNull("300"), 300);
  assert.equal(numberOrNull("990.5"), 990.5);
});

test("a unit does not lose the value", () => {
  // The real case: the notice says "990.0 KGM" and a strict Number() would
  // discard a weight that was read correctly.
  assert.equal(numberOrNull("990.0 KGM"), 990);
  assert.equal(numberOrNull("21500 KG"), 21500);
});

test("thousands separators are stripped", () => {
  assert.equal(numberOrNull("8,305.500"), 8305.5);
});

test("absence stays absent", () => {
  for (const empty of ["", "   ", null, undefined, "N/A", "—"]) {
    assert.equal(numberOrNull(empty), null, `${JSON.stringify(empty)} should be null`);
  }
});
