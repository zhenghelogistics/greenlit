import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseArrivalNoticeText } from "../lib/arrival-notice-parser.mjs";

/**
 * The golden set. See docs/extraction-engine.md.
 *
 * Each `<name>.txt` is the text of a real document; each `<name>.expected.json`
 * is what a person says the fields actually are. This reports per-field
 * accuracy rather than passing or failing on one document, because the useful
 * question is "which field is worst" — that is the next thing to work on.
 *
 * The floor exists so improving one carrier cannot quietly break another. Raise
 * it as accuracy improves; never lower it to make a change pass.
 */
const ACCURACY_FLOOR = 0.85;

const DIR = fileURLToPath(new URL("../fixtures/extraction/", import.meta.url));

async function cases() {
  const files = await readdir(DIR);
  return files
    .filter((f) => f.endsWith(".txt"))
    .map((f) => ({ name: f.replace(/\.txt$/, ""), text: join(DIR, f) }));
}

const normalise = (v) =>
  String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

test("golden set: every document has ground truth beside it", async () => {
  const found = await cases();
  assert.ok(found.length > 0, "the golden set is empty");
  for (const c of found) {
    const expected = join(DIR, `${c.name}.expected.json`);
    await assert.doesNotReject(
      () => readFile(expected, "utf8"),
      `${c.name} has no .expected.json; a document without ground truth measures nothing`,
    );
  }
});

test("golden set: per-field extraction accuracy", async () => {
  const found = await cases();
  const perField = new Map();
  let total = 0;
  let correct = 0;

  for (const c of found) {
    const text = await readFile(c.text, "utf8");
    const expected = JSON.parse(
      await readFile(join(DIR, `${c.name}.expected.json`), "utf8"),
    );
    const parsed = parseArrivalNoticeText(text);
    const actual = {
      ...parsed.values,
      containerNumber: parsed.containers?.[0]?.number ?? parsed.values.containerNumber,
    };

    for (const [field, want] of Object.entries(expected)) {
      if (field.startsWith("$")) continue;
      const got = actual[field];
      // A value the parser found and a person agrees with. Substring counts:
      // "PSA PASIR PANJANG TERMINAL" inside a longer capture is still right.
      const hit = normalise(got).includes(normalise(want)) && normalise(want) !== "";
      const row = perField.get(field) ?? { hit: 0, seen: 0 };
      row.seen += 1;
      if (hit) row.hit += 1;
      perField.set(field, row);
      total += 1;
      if (hit) correct += 1;
    }
  }

  const accuracy = total ? correct / total : 0;
  const worst = [...perField.entries()]
    .filter(([, r]) => r.hit < r.seen)
    .map(([f, r]) => `${f} ${r.hit}/${r.seen}`);

  console.log(`\n  extraction accuracy: ${correct}/${total} fields (${Math.round(accuracy * 100)}%) across ${found.length} document(s)`);
  if (worst.length) console.log(`  weakest fields: ${worst.join(", ")}`);

  assert.ok(
    accuracy >= ACCURACY_FLOOR,
    `accuracy ${Math.round(accuracy * 100)}% is below the ${ACCURACY_FLOOR * 100}% floor. Weakest: ${worst.join(", ")}`,
  );
});
