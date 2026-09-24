import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPermit, permitNumberLooksValid, normalisePermitNumber, containersWithoutPermit, permitNumberChanged } from '../src/permits.ts';

const JOB = { vesselName: 'CALLAO BRIDGE', voyageNumber: '256S', eta: '2026-09-19' };
const PERMIT = {
  permitId: 'p1',
  permitNumber: 'IG6I728642H',
  expiryDate: '2026-09-30',
  permitVesselVoyage: 'CALLAO BRIDGE / 256S',
  fileName: 'permit.pdf',
  linkedContainerIds: ['c1', 'c2'],
};

test('§24: a permit matching its sailing and outlasting arrival is valid', () => {
  const v = checkPermit(PERMIT, JOB);
  assert.equal(v.overall, 'VALID');
  assert.deepEqual(v.issues, []);
});

test('§24: the same sailing written differently still matches', () => {
  // "CALLAO BRIDGE / 256S" and "CALLAO BRIDGE 256S" are one voyage in two
  // hands. Only letters and digits carry meaning.
  for (const written of ['CALLAO BRIDGE 256S', 'callao bridge/256s', 'CALLAO  BRIDGE  /  256-S']) {
    assert.equal(checkPermit({ ...PERMIT, permitVesselVoyage: written }, JOB).vessel, 'VALID',
      `${written} is the same sailing`);
  }
});

test('§24: a changed voyage turns the permit amber, and says why', () => {
  // The failure this exists to catch: the job is amended to 257S and the
  // permit, issued for 256S, would otherwise stay green.
  const v = checkPermit(PERMIT, { ...JOB, voyageNumber: '257S' });
  assert.equal(v.vessel, 'ATTENTION');
  assert.equal(v.overall, 'ATTENTION');
  assert.match(v.issues[0] ?? '', /256S/);
  assert.match(v.issues[0] ?? '', /257S/);
  assert.match(v.issues[0] ?? '', /amended permit/);
});

test('§24: expiry must outlast arrival, and the same day is not enough', () => {
  // Operations were explicit: a permit expiring the day the vessel arrives
  // leaves no time to present it.
  assert.equal(checkPermit({ ...PERMIT, expiryDate: '2026-09-20' }, JOB).expiry, 'VALID');
  assert.equal(checkPermit({ ...PERMIT, expiryDate: '2026-09-19' }, JOB).expiry, 'ATTENTION');
  assert.equal(checkPermit({ ...PERMIT, expiryDate: '2026-09-18' }, JOB).expiry, 'ATTENTION');

  const sameDay = checkPermit({ ...PERMIT, expiryDate: '2026-09-19' }, JOB);
  assert.match(sameDay.issues[0] ?? '', /same day/);
});

test('§24: an ETA that moves past the expiry turns it amber without anyone editing the permit', () => {
  // The other direction of the same problem. The permit did not change; the
  // sailing did.
  assert.equal(checkPermit(PERMIT, JOB).expiry, 'VALID');
  assert.equal(checkPermit(PERMIT, { ...JOB, eta: '2026-10-05' }).expiry, 'ATTENTION');
});

test('§24: the Singapore permit number shape', () => {
  assert.equal(permitNumberLooksValid('IG6I728642H'), true, 'the real example');
  assert.equal(permitNumberLooksValid('ME1A123456B'), true, 'the ME form');
  assert.equal(permitNumberLooksValid('ig6i728642h'), true, 'case is not identity');
  assert.equal(permitNumberLooksValid('IG6I 728642 H'), true, 'spacing is not identity');

  assert.equal(permitNumberLooksValid('IG6I72864H'), false, 'five digits, not six');
  assert.equal(permitNumberLooksValid('XX6I728642H'), false, 'not an issued prefix');
  assert.equal(permitNumberLooksValid('IG6I7286421'), false, 'must end in a letter');
  assert.equal(permitNumberLooksValid(''), false);
});

test('§24: a number of the wrong shape is flagged, never rejected', () => {
  // Customs can issue a shape we have not seen, and refusing a real permit is
  // worse than accepting a mistyped one the other checks still scrutinise.
  const v = checkPermit({ ...PERMIT, permitNumber: 'IG6I72864H' }, JOB);
  assert.equal(v.numberFormat, 'ATTENTION');
  assert.match(v.issues[0] ?? '', /not the usual shape/);
  assert.equal(v.vessel, 'VALID', 'the other checks still run');
});

test('§24: what is not yet known reads as review, not as failure', () => {
  const bare = checkPermit(
    { ...PERMIT, permitNumber: null, expiryDate: null, permitVesselVoyage: null }, JOB);
  assert.equal(bare.overall, 'REVIEW');
  assert.deepEqual(bare.issues, [], 'an unanswered question is not a complaint');
});

test('§24: a job with no vessel yet cannot fail a permit', () => {
  const v = checkPermit(PERMIT, { vesselName: null, voyageNumber: null, eta: null });
  assert.equal(v.vessel, 'REVIEW');
  assert.equal(v.expiry, 'REVIEW');
});

test('§24: one permit covers many containers, one container takes many permits', () => {
  const permits = [
    { ...PERMIT, permitId: 'p1', linkedContainerIds: ['c1', 'c2'] },
    { ...PERMIT, permitId: 'p2', linkedContainerIds: ['c2', 'c3'] },
  ];
  // c2 is on both, which is the many-to-many case a permitNumber field on the
  // container could not express.
  assert.deepEqual(containersWithoutPermit(permits, ['c1', 'c2', 'c3']), []);
  assert.deepEqual(containersWithoutPermit(permits, ['c1', 'c2', 'c3', 'c4']), ['c4']);
  assert.deepEqual(containersWithoutPermit([], ['c1']), ['c1']);
});

test('normalising a permit number', () => {
  assert.equal(normalisePermitNumber(' ig6i-728642 h '), 'IG6I728642H');
});

test('a changed permit number is worth reading twice, and is never refused', () => {
  // An amended permit genuinely gets a new number, which is the point of
  // amending it. But the numbers differ by a character or two and are typed
  // from a PDF, so a change is equally likely to be a slip — and the old one
  // is already on paperwork that went to a customer.
  assert.equal(permitNumberChanged(null, 'IG6I789494H'), null, 'a first number is not a change');
  assert.equal(permitNumberChanged('IG6I789494H', 'IG6I789494H'), null);
  assert.equal(permitNumberChanged('ig6i789494h', 'IG6I789494H'), null, 'case is not a change');
  assert.match(permitNumberChanged('IG6I789494H', 'IG6I789494J') ?? '', /was IG6I789494H and is now IG6I789494J/);
});
