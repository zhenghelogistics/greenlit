import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CRITICAL_FIELDS, canMatchReadiness, field, idempotencyKey, isAlreadyProcessed,
  matchOutcome, reconcileExtraction, reconcileVgm,
} from '../src/extraction.ts';

const AT = '2026-09-01T09:03:12Z';
const f = <T>(value: T, confidence = 0.99, source = 'NOA.pdf') =>
  field(value, source, confidence, AT);

test('§11.1: an extracted field carries value, source, confidence and timestamp', () => {
  const c = field('ABCU1234567', 'NOA.pdf', 0.99, AT);
  assert.deepEqual(c, {
    value: 'ABCU1234567', source: 'NOA.pdf', confidence: 0.99, extractedAt: AT,
  });
});

test('§12: an extracted value never silently overwrites a critical field', () => {
  const stored = { eta: '2026-08-17', deliveryAddress: '12 Tuas Ave 8' };
  const r = reconcileExtraction(stored, { eta: f('2026-08-18') });

  assert.deepEqual(r.updates, {}, 'nothing is written');
  assert.equal(r.discrepancies.length, 1);
  const [d] = r.discrepancies;
  assert.equal(d?.field, 'eta');
  assert.equal(d?.storedValue, '2026-08-17', 'the stored value stays in place');
  assert.equal(d?.extractedValue, '2026-08-18');
  assert.equal(d?.source, 'NOA.pdf', 'provenance travels with the discrepancy');
});

test('§12: filling an empty critical field is not a conflict', () => {
  const r = reconcileExtraction({ eta: null }, { eta: f('2026-08-18') });
  assert.deepEqual(r.updates, { eta: '2026-08-18' });
  assert.deepEqual(r.discrepancies, [], 'there was nothing to contradict');
});

test('§12: non-critical fields update freely', () => {
  const r = reconcileExtraction(
    { cargoDescription: 'Goods' },
    { cargoDescription: f('Machine parts') },
  );
  assert.deepEqual(r.updates, { cargoDescription: 'Machine parts' });
  assert.deepEqual(r.discrepancies, []);
});

test('§12: an identical value is neither an update nor a discrepancy', () => {
  const r = reconcileExtraction({ eta: '2026-08-17' }, { eta: f('2026-08-17') });
  assert.deepEqual(r.updates, {});
  assert.deepEqual(r.discrepancies, []);
  assert.deepEqual(r.unchanged, ['eta']);
});

test('§12: the critical list matches the section', () => {
  for (const name of ['containerNumber', 'blNumber', 'permitNumber', 'eta',
    'deliveryAddress', 'carrier', 'emptyReturnYard', 'vgm', 'bookingReference',
    'exportClearanceReference']) {
    assert.ok(CRITICAL_FIELDS.includes(name), `${name} is critical per §12`);
  }
});

test('§11.3: a low-confidence value never updates a job silently', () => {
  const r = reconcileExtraction(
    { cargoDescription: null },
    { cargoDescription: f('Maybe machine parts', 0.4) },
    { minConfidence: 0.8 },
  );
  assert.deepEqual(r.updates, {});
  assert.match(r.discrepancies[0]?.reason ?? '', /below the 0.8 threshold/);
});

test('§11.4: an extracted VGM never overwrites an existing VGM', () => {
  const r = reconcileVgm(24500, f(25000), 3850);
  assert.equal(r.accepted, false);
  assert.match(r.discrepancy?.reason ?? '', /already recorded/);
});

test('§11.4 with §43: a VGM at or below tare is refused', () => {
  assert.equal(reconcileVgm(null, f(3850), 3850).accepted, false);
  assert.equal(reconcileVgm(null, f(3851), 3850).accepted, true);
});

test('§11.4: a first VGM is accepted and stamped', () => {
  const r = reconcileVgm(null, f(24500), 3850);
  assert.equal(r.accepted, true);
  assert.equal(r.discrepancy, null);
});

test('§11.4: readiness matches on job or container number only', () => {
  assert.equal(canMatchReadiness(['containerNumber']), true);
  assert.equal(canMatchReadiness(['jobNumber']), true);
  assert.equal(canMatchReadiness(['bookingReference']), false,
    'a booking reference is shared across jobs and is not sufficient evidence');
  assert.equal(canMatchReadiness(['customerReference', 'bookingReference']), false);
});

test('§11.3: automation does not force uncertain matches', () => {
  const one = [{ jobId: 'a', confidence: 0.95 }];
  const many = [{ jobId: 'a', confidence: 0.95 }, { jobId: 'b', confidence: 0.91 }];
  const weak = [{ jobId: 'a', confidence: 0.42 }];

  assert.equal(matchOutcome(one, 0.9), 'AUTO_MATCH');
  assert.equal(matchOutcome(many, 0.9), 'REVIEW_REQUIRED', 'several candidates go to review');
  assert.equal(matchOutcome(weak, 0.9), 'REVIEW_REQUIRED', 'below threshold goes to review');
  assert.equal(matchOutcome([], 0.9), 'UNMATCHED', 'never guessed onto a job');
});

test('§11.5: the same email processed twice is recognised', () => {
  const key = idempotencyKey('<msg-1@carrier.com>', ['sha-a', 'sha-b']);
  const seen = new Set([key]);
  assert.equal(isAlreadyProcessed(key, seen), true);
  assert.equal(isAlreadyProcessed(idempotencyKey('<msg-2@carrier.com>'), seen), false);
});

test('§11.5: attachment order does not change the key', () => {
  assert.equal(
    idempotencyKey('<msg-1>', ['sha-b', 'sha-a']),
    idempotencyKey('<msg-1>', ['sha-a', 'sha-b']),
    'a redelivery with attachments in a different order is the same email',
  );
});

test('§12: a mixed extraction separates what may be written from what may not', () => {
  const stored = { eta: '2026-08-17', cargoDescription: null, blNumber: null };
  const r = reconcileExtraction(stored, {
    eta: f('2026-08-19'),
    cargoDescription: f('Machine parts'),
    blNumber: f('BL998877'),
  });
  assert.deepEqual(r.updates, { cargoDescription: 'Machine parts', blNumber: 'BL998877' });
  assert.equal(r.discrepancies.length, 1);
  assert.equal(r.discrepancies[0]?.field, 'eta');
});

test('§43.1: a VGM arriving while stuffing transfers remain outstanding is refused', () => {
  const r = reconcileVgm(null, f(24500), 3850, false);
  assert.equal(r.accepted, false);
  assert.match(r.discrepancy?.reason ?? '', /still outstanding/);
  // The same figure once stuffing is finished is accepted.
  assert.equal(reconcileVgm(null, f(24500), 3850, true).accepted, true);
});

test('§11.1: the parser output gains the provenance it lacks', async () => {
  const { toExtractedFields } = await import('../src/extraction.ts');
  const fields = toExtractedFields(
    { containerNumber: 'ABCU1234567', eta: '2026-08-20', sealNumber: '' },
    { containerNumber: 'high', eta: 'review', sealNumber: 'missing' },
    'NOA.pdf',
    AT,
  );

  assert.deepEqual(fields.containerNumber, {
    value: 'ABCU1234567', source: 'NOA.pdf', confidence: 0.95, extractedAt: AT,
  });
  assert.equal(fields.eta?.confidence, 0.6, 'a review-grade value is not high confidence');
  assert.equal(fields.sealNumber?.confidence, 0);
});

test('§11.1 + §12: parser output flows through reconciliation with its source intact', async () => {
  const { toExtractedFields } = await import('../src/extraction.ts');
  const fields = toExtractedFields(
    { eta: '2026-08-20' }, { eta: 'high' }, 'NOA.pdf', AT,
  );
  const r = reconcileExtraction({ eta: '2026-08-17' }, fields);
  assert.equal(r.discrepancies[0]?.source, 'NOA.pdf',
    'the controller can see which document disagreed');
});
