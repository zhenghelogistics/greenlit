import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canChangeJobNumber, checkContainerUniqueness, datePart, isContainerNumberValid,
  nextJobNumber, normaliseContainerNumber, parseJobNumber,
} from '../src/job-numbers.ts';

test('§8.1: numbers follow the documented shape', () => {
  assert.equal(nextJobNumber([], 'IMPORT', '2026-08-17'), 'JOB-260817-001');
  assert.equal(nextJobNumber([], 'EXPORT', '2026-08-17'), 'EXP-260817-001');
});

test('§8.1: the sequence increments within a day', () => {
  const existing = ['JOB-260817-001', 'JOB-260817-002'];
  assert.equal(nextJobNumber(existing, 'IMPORT', '2026-08-17'), 'JOB-260817-003');
});

test('§8.1: the two sequences are independent', () => {
  const existing = ['JOB-260817-001', 'JOB-260817-002'];
  assert.equal(nextJobNumber(existing, 'EXPORT', '2026-08-17'), 'EXP-260817-001',
    'export numbering is not affected by import numbering');
});

test('§8.1: the sequence resets each day', () => {
  const existing = ['JOB-260817-009'];
  assert.equal(nextJobNumber(existing, 'IMPORT', '2026-08-18'), 'JOB-260818-001');
});

test('§8.1: numbers are unique across both domains despite matching sequences', () => {
  const a = nextJobNumber([], 'IMPORT', '2026-08-17');
  const b = nextJobNumber([], 'EXPORT', '2026-08-17');
  assert.notEqual(a, b, 'the prefix carries the domain');
});

test('§8.1: a job number is immutable after creation', () => {
  assert.equal(canChangeJobNumber().allowed, false);
});

test('§8.1: numbers parse back to their parts', () => {
  assert.deepEqual(parseJobNumber('EXP-260818-004'),
    { domain: 'EXPORT', datePart: '260818', sequence: 4 });
  assert.equal(parseJobNumber('nonsense'), null);
});

test('§8.1: malformed existing numbers do not corrupt the sequence', () => {
  const existing = ['JOB-260817-001', 'not-a-job-number', ''];
  assert.equal(nextJobNumber(existing, 'IMPORT', '2026-08-17'), 'JOB-260817-002');
});

test('date part is the last two digits of the year', () => {
  assert.equal(datePart('2026-08-17'), '260817');
});

test('§29.1: a container number is unique across OPEN jobs, not globally', () => {
  const uses = [
    { containerNumber: 'ABCU1234567', jobId: 'j1', jobNumber: 'JOB-260801-001', jobOpen: false },
  ];
  assert.equal(checkContainerUniqueness('ABCU1234567', uses).unique, true,
    'reuse on a closed job is legitimate and expected');
});

test('§29.1: reuse on an open job is flagged with the clash named', () => {
  const uses = [
    { containerNumber: 'ABCU1234567', jobId: 'j1', jobNumber: 'JOB-260817-001', jobOpen: true },
  ];
  const r = checkContainerUniqueness('ABCU1234567', uses);
  assert.equal(r.unique, false);
  assert.equal(r.clash?.jobNumber, 'JOB-260817-001');
  assert.match(r.reason ?? '', /confirm explicitly/, 'it requires confirmation, not refusal');
});

test('§29.1: a job does not clash with itself', () => {
  const uses = [
    { containerNumber: 'ABCU1234567', jobId: 'j1', jobNumber: 'JOB-260817-001', jobOpen: true },
  ];
  assert.equal(checkContainerUniqueness('ABCU1234567', uses, 'j1').unique, true);
});

test('§29.1: container numbers are normalised then format-checked', () => {
  assert.equal(normaliseContainerNumber(' abcu 123 4567 '), 'ABCU1234567');
  assert.equal(isContainerNumberValid('abcu1234567'), true);
  assert.equal(isContainerNumberValid('ABC1234567'), false, 'four letters are required');
  assert.equal(isContainerNumberValid('ABCU123456'), false, 'seven digits are required');
});
