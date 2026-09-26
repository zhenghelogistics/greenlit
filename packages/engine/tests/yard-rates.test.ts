import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { rateOn, ratesOn, rateHistory, rateProblem, YARD_CHARGES,
  type YardRate } from '../src/yard-rates.ts';

const rate = (
  yardCode: string, charge: YardRate['charge'], amount: number, effectiveFrom: string,
): YardRate => ({
  rateId: `${yardCode}-${charge}-${effectiveFrom}`, yardCode, charge, amount,
  effectiveFrom, remarks: null, recordedBy: 'tester', recordedAt: `${effectiveFrom}T00:00:00Z`,
});

const book: YardRate[] = [
  rate('CWT', 'DHC', 80, '2026-01-01'),
  rate('CWT', 'DHC', 85, '2026-04-27'),
  rate('CWT', 'DEPOT_SURCHARGE', 15, '2026-05-02'),
  rate('A', 'DHC', 90, '2026-06-15'),
];

test('a rate is the last one that had already started', () => {
  // The whole point of versioning. An invoice raised in March was right in
  // March, and a question asked in October about March needs March's number.
  assert.equal(rateOn(book, 'CWT', 'DHC', '2026-03-01')?.amount, 80);
  assert.equal(rateOn(book, 'CWT', 'DHC', '2026-04-27')?.amount, 85);
  assert.equal(rateOn(book, 'CWT', 'DHC', '2026-09-26')?.amount, 85);
});

test('the day it takes effect is the first day it applies', () => {
  // Off by one here is a day of invoices at the wrong price.
  assert.equal(rateOn(book, 'CWT', 'DHC', '2026-04-26')?.amount, 80);
  assert.equal(rateOn(book, 'CWT', 'DHC', '2026-04-27')?.amount, 85);
});

test('a rate entered ahead of time does not change today', () => {
  // Somebody entering next quarter's increase early is doing the right thing
  // and must not move this quarter's answer by doing it.
  const withNext = [...book, rate('CWT', 'DHC', 95, '2026-12-01')];
  assert.equal(rateOn(withNext, 'CWT', 'DHC', '2026-09-26')?.amount, 85);
  assert.equal(rateOn(withNext, 'CWT', 'DHC', '2026-12-01')?.amount, 95);
});

test('nothing on file is null, which is not a rate of zero', () => {
  // Most of these were never written down before. A gap is a question worth
  // seeing, not a free service.
  assert.equal(rateOn(book, 'CWT', 'CDMS_ADMIN_FEE', '2026-09-26'), null);
  assert.equal(rateOn(book, 'PSA', 'DHC', '2026-09-26'), null);
  assert.equal(rateOn(book, 'A', 'DHC', '2026-01-01'), null, 'before it was ever set');
});

test('a yard shows every charge, including the ones nobody has recorded', () => {
  const shown = ratesOn(book, 'CWT', '2026-09-26');
  assert.deepEqual(Object.keys(shown).sort(), [...YARD_CHARGES].sort());
  assert.equal(shown.DHC?.amount, 85);
  assert.equal(shown.DEPOT_SURCHARGE?.amount, 15);
  assert.equal(shown.CDMS_ADMIN_FEE, null);
});

test('history is newest first and shows what has not started yet', () => {
  // This screen is where somebody checks next month's increase went in.
  const ahead = [...book, rate('CWT', 'DHC', 95, '2026-12-01')];
  assert.deepEqual(rateHistory(ahead, 'CWT', 'DHC').map((r) => r.amount), [95, 85, 80]);
});

test('a rate that started in the past is allowed, because that happens', () => {
  // A yard that raised its charge three weeks ago and told nobody is ordinary.
  // Refusing it would make the only way to record the truth a wrong date.
  assert.equal(rateProblem({ amount: 85, effectiveFrom: '2020-01-01' }), null);
  assert.match(String(rateProblem({ amount: -1, effectiveFrom: '2026-01-01' })), /negative/);
  assert.match(String(rateProblem({ amount: 10, effectiveFrom: '1 Jan 26' })), /yyyy-mm-dd/);
  assert.match(String(rateProblem({ amount: Number.NaN, effectiveFrom: '2026-01-01' })), /amount/);
});

test('no rate is computed into money owed', () => {
  // Billing is not this application's job, and the moment a total appears here
  // somebody will rely on it. These are figures to look up and correct.
  //
  // Read with the comments stripped, so the prose explaining the rule is not
  // mistaken for a breach of it.
  const source = new URL('../src/yard-rates.ts', import.meta.url);
  const code = readFileSync(source, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  assert.doesNotMatch(code, /\binvoice|\btotal|\bsubtotal|\bgst\b/i);
  // No arithmetic on amounts either: picking which figure applies is a rule,
  // adding figures together is billing.
  assert.doesNotMatch(code, /amount\s*[+*]/);
});
