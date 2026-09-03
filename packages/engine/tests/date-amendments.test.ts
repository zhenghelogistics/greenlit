import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAmendment, dateFieldHistory, detectDateChurn, disruptionScore,
  validateAmendment, type AmendmentRequest, type DateAmendment,
} from '../src/date-amendments.ts';

const req = (o: Partial<AmendmentRequest> = {}): AmendmentRequest => ({
  entityType: 'job', entityId: 'ej1', dateField: 'deliveryDate',
  previousValue: '2026-08-28', newValue: '2026-08-29',
  reasonCode: 'CUSTOMER_REQUEST', reasonNote: null,
  amendedBy: 'Winnie', amendedAt: '2026-08-27T02:00:00Z', ...o,
});

test('§13.1: a date cannot be changed without a reason code', () => {
  const r = validateAmendment(req({ reasonCode: null }));
  assert.equal(r.valid, false);
  assert.match(r.reason ?? '', /reason code/);
});

test('§13.1: reason code OTHER requires a note', () => {
  assert.equal(validateAmendment(req({ reasonCode: 'OTHER' })).valid, false);
  assert.equal(validateAmendment(req({ reasonCode: 'OTHER', reasonNote: 'Yard closed' })).valid, true);
});

test('§13.1: an amendment requires a named user', () => {
  assert.equal(validateAmendment(req({ amendedBy: '  ' })).valid, false);
});

test('§13.1: an unchanged date is not an amendment', () => {
  assert.equal(validateAmendment(req({ newValue: '2026-08-28' })).valid, false);
});

test('§13.1: amendments append and number themselves per field', () => {
  const first = appendAmendment([], req(), 'a1');
  assert.equal(first.amendment.sequence, 1);

  const second = appendAmendment(first.log,
    req({ previousValue: '2026-08-29', newValue: '2026-08-31', reasonCode: 'VESSEL_DELAY' }), 'a2');
  assert.equal(second.amendment.sequence, 2);
  assert.equal(second.log.length, 2);
});

test('§13.1: sequences are per date field, not per job', () => {
  const a = appendAmendment([], req(), 'a1');
  const b = appendAmendment(a.log, req({ dateField: 'vesselEta', previousValue: '2026-09-01', newValue: '2026-09-03' }), 'a2');
  assert.equal(b.amendment.sequence, 1, 'a different date field starts its own count');
});

test('§13.1: a wrong entry is corrected by a further amendment, never an edit', () => {
  const a = appendAmendment([], req(), 'a1');
  const corrected = appendAmendment(a.log,
    req({ previousValue: '2026-08-29', newValue: '2026-08-28', reasonCode: 'INTERNAL_RESCHEDULE' }), 'a2');
  assert.equal(corrected.log.length, 2, 'the original entry survives');
  assert.equal(corrected.log[0]?.newValue, '2026-08-29', 'and is unchanged');
});

test('§13.1: an invalid amendment cannot be appended at all', () => {
  assert.throws(() => appendAmendment([], req({ reasonCode: null }), 'a1'), /reason code/);
});

test('§13.1: history shows the original, the current value and the count', () => {
  let log: DateAmendment[] = [];
  log = appendAmendment(log, req(), 'a1').log;
  log = appendAmendment(log, req({ previousValue: '2026-08-29', newValue: '2026-08-31', reasonCode: 'VESSEL_DELAY' }), 'a2').log;
  log = appendAmendment(log, req({ previousValue: '2026-08-31', newValue: '2026-09-01', reasonCode: 'PORTNET_ETA_CHANGE' }), 'a3').log;

  const h = dateFieldHistory(log, 'ej1', 'deliveryDate');
  assert.equal(h.originalValue, '2026-08-28', 'the original stays visible');
  assert.equal(h.currentValue, '2026-09-01');
  assert.equal(h.amendmentCount, 3);
});

test('§13.1: the history carries every reason, which the audit stream cannot', () => {
  let log: DateAmendment[] = [];
  log = appendAmendment(log, req(), 'a1').log;
  log = appendAmendment(log, req({ previousValue: '2026-08-29', newValue: '2026-08-31',
    reasonCode: 'VESSEL_DELAY', reasonNote: 'ONE Splendour v.114E pushed 2 days' }), 'a2').log;

  const h = dateFieldHistory(log, 'ej1', 'deliveryDate');
  assert.deepEqual(h.amendments.map((a) => a.reasonCode), ['CUSTOMER_REQUEST', 'VESSEL_DELAY']);
  assert.match(h.amendments[1]?.reasonNote ?? '', /Splendour/);
});

test('§13.1.3: churn past the threshold raises a low-severity signal', () => {
  let log: DateAmendment[] = [];
  for (let i = 0; i < 4; i += 1) {
    log = appendAmendment(log, req({
      previousValue: `2026-08-2${i + 5}`, newValue: `2026-08-2${i + 6}`,
    }), `a${i}`).log;
  }
  const found = detectDateChurn(log, 'ej1', 3);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'LOW', 'the point is visibility, not blocking');
});

test('§13.1.3: churn below the threshold is normal and silent', () => {
  const log = appendAmendment([], req(), 'a1').log;
  assert.deepEqual(detectDateChurn(log, 'ej1', 3), [], 'amendments are normal; the operation runs on them');
});

test('§13.1.3: disruption counts customer-driven moves specifically', () => {
  let log: DateAmendment[] = [];
  log = appendAmendment(log, req({ reasonCode: 'CUSTOMER_REQUEST' }), 'a1').log;
  log = appendAmendment(log, req({ previousValue: '2026-08-29', newValue: '2026-08-30', reasonCode: 'VESSEL_DELAY' }), 'a2').log;
  log = appendAmendment(log, req({ previousValue: '2026-08-30', newValue: '2026-08-31', reasonCode: 'CUSTOMER_NO_SPACE' }), 'a3').log;

  assert.equal(disruptionScore(log), 2,
    'a vessel delay is not the customer being difficult');
});
