import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARRIERS, carrierByCode, matchCarrier, standardFreeTime, LOOKUP_WORDS,
} from '../src/carriers.ts';

test('every carrier operations named is here, by its code', () => {
  // The codes are what appear on paperwork and in conversation, so the list is
  // checked against them rather than against names, which vary.
  const codes = CARRIERS.map((c) => c.code).sort();
  assert.deepEqual(codes, [
    'AL', 'CC', 'CM', 'CX', 'EA', 'EH', 'HE', 'HL', 'HY', 'IL',
    'KM', 'MD', 'MS', 'NJ', 'ON', 'OR', 'PI', 'QM', 'RC', 'WH', 'YM',
  ]);
});

test('a long printed name finds the short one', () => {
  // The reason this exists: a notice prints the legal name and the screen has
  // room for a code. Operations asked for exactly this — "it picks up on OOCL
  // but it appears as the full company which is very long".
  assert.equal(matchCarrier('ORIENT OVERSEAS CONTAINER LINE')?.code, 'OR');
  assert.equal(matchCarrier('Hapag-Lloyd')?.code, 'HL');
  assert.equal(matchCarrier('MEDITERRANEAN SHIPPING COMPANY')?.code, 'MD');
  assert.equal(matchCarrier('OR')?.code, 'OR');
});

test('a name inside another name does not win', () => {
  // 'CM' is a code and it appears inside 'CMA CGM'. Matching short-first would
  // answer the wrong carrier, and a wrong carrier sends somebody to the wrong
  // website for a deadline.
  assert.equal(matchCarrier('CMA CGM')?.code, 'CM');
  assert.equal(matchCarrier('CNC LINE')?.code, 'CX');
});

test('an unknown carrier is null rather than a guess', () => {
  // Null is what makes the dropdown appear. A guess would be silently wrong.
  assert.equal(matchCarrier('SOME FEEDER NOBODY HAS HEARD OF'), null);
  assert.equal(matchCarrier(''), null);
  assert.equal(matchCarrier(null), null);
  assert.equal(carrierByCode('ZZ'), null);
});

test('where to look is recorded for both facts, for every carrier', () => {
  // The point of the list. Operations look a last free day up in four
  // different places depending on the carrier, and that knowledge lived in
  // people's heads.
  for (const carrier of CARRIERS) {
    assert.ok(LOOKUP_WORDS[carrier.returnYard], `${carrier.code}: no yard source`);
    assert.ok(LOOKUP_WORDS[carrier.lastFreeDay], `${carrier.code}: no last-free-day source`);
  }
});

test('the carriers that publish a standard allowance say so in one shape', () => {
  // §34.3: a combined pool and a split pair are different things and mixing
  // them invents a deadline. KMTC gives six days combined; CMA gives three and
  // three. Neither may come back as both.
  const kmtc = standardFreeTime(carrierByCode('KM'));
  assert.equal(kmtc?.model, 'COMBINED');
  assert.equal(kmtc?.combinedDays, 6);
  assert.equal(kmtc?.demurrageDays, null);

  const cma = standardFreeTime(carrierByCode('CM'));
  assert.equal(cma?.model, 'SPLIT');
  assert.equal(cma?.demurrageDays, 3);
  assert.equal(cma?.detentionDays, 3);
  assert.equal(cma?.combinedDays, null);

  // A carrier that publishes nothing offers nothing, rather than a zero that
  // would read as "no free time at all".
  assert.equal(standardFreeTime(carrierByCode('MS')), null);
  assert.equal(standardFreeTime(null), null);
});

test('the carriers whose answer is an email are marked as such', () => {
  // These are the jobs that take days rather than minutes, and knowing which
  // ones they are on the morning the notice arrives is the whole point.
  const byEmail = CARRIERS.filter((c) => c.lastFreeDay === 'EMAIL').map((c) => c.code);
  assert.deepEqual(byEmail.sort(), ['EA', 'EH', 'HE', 'MD', 'PI', 'QM']);
});

test('a carrier with something to know about it says what', () => {
  assert.match(carrierByCode('KM')?.note ?? '', /TBL1/);
  assert.match(carrierByCode('EA')?.note ?? '', /Gate 4/);
  assert.match(carrierByCode('WH')?.note ?? '', /Sundays/);
});
