import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canChangeCustomerCode, nextJobReference, normaliseCustomerCode,
  parseJobReference, sortCustomerJobs, validateCustomerCode, validateCustomerDraft,
  type Customer,
} from '../src/customers.ts';

const customer = (code: string, companyName: string): Customer => ({
  customerId: code.toLowerCase(), code, companyName, shortName: null,
  billingName: null, defaultConsignee: null, defaultDeliveryAddress: null,
  defaultContact: null, emailDomains: [], accountStatus: 'ACTIVE', notes: null,
  createdAt: '2026-01-01T00:00:00Z',
});
const existing = [customer('ABC', 'ABC Company'), customer('LCT', 'Lion City Traders')];

test('a customer code is two to six letters, uppercased', () => {
  assert.equal(normaliseCustomerCode(' abc '), 'ABC');
  assert.equal(validateCustomerCode('abc', []).code, 'ABC');
  assert.equal(validateCustomerCode('A', []).valid, false, 'too short');
  assert.equal(validateCustomerCode('ABCDEFG', []).valid, false, 'too long');
  assert.equal(validateCustomerCode('AB1', []).valid, false, 'letters only');
});

test('a code already in use names who holds it', () => {
  const r = validateCustomerCode('abc', existing);
  assert.equal(r.valid, false);
  assert.match(r.reason ?? '', /ABC Company/, 'so the operator knows why it is taken');
});

test('a code is immutable once issued', () => {
  assert.equal(canChangeCustomerCode().allowed, false);
  assert.match(canChangeCustomerCode().reason, /already use it/);
});

test('§9: a repeated company name is refused as a likely duplicate', () => {
  const r = validateCustomerDraft({ code: 'ABCD', companyName: 'abc company' }, existing);
  assert.equal(r.valid, false);
  assert.ok(r.reasons.some((x) => /already exists/.test(x)),
    'users must not enter slightly different names for one customer');
});

test('a draft needs both a valid code and a company name', () => {
  assert.deepEqual(validateCustomerDraft({ code: 'ZZ', companyName: 'Zenith Shipping' }, existing).reasons, []);
  assert.equal(validateCustomerDraft({ code: 'ZZ', companyName: '' }, existing).valid, false);
});

test('email domains are checked, since matching relies on them', () => {
  const r = validateCustomerDraft(
    { code: 'ZZ', companyName: 'Zenith', emailDomains: ['zenith.com', 'not a domain'] }, existing);
  assert.equal(r.valid, false);
  assert.ok(r.reasons.some((x) => /not a valid email domain/.test(x)));
});

test('the first job for a customer is 001', () => {
  assert.equal(nextJobReference([], 'ABC'), 'ABC-001');
});

test('the sequence runs on, and does not reset by date', () => {
  assert.equal(nextJobReference(['ABC-001', 'ABC-002'], 'ABC'), 'ABC-003');
});

test('one sequence per customer covers both domains', () => {
  // Opening a company shows its jobs in the order they happened, not two
  // interleaved sequences.
  assert.equal(nextJobReference(['ABC-001'], 'ABC'), 'ABC-002',
    'an export follows an import in the same run');
});

test('customers do not share a sequence', () => {
  const issued = ['ABC-001', 'ABC-002', 'LCT-001'];
  assert.equal(nextJobReference(issued, 'LCT'), 'LCT-002');
  assert.equal(nextJobReference(issued, 'ABC'), 'ABC-003');
});

test('a new customer starts at 001 regardless of anyone else', () => {
  assert.equal(nextJobReference(['ABC-057', 'LCT-113'], 'ZZ'), 'ZZ-001');
});

test('references parse back to customer and sequence', () => {
  assert.deepEqual(parseJobReference('ABC-042'), { customerCode: 'ABC', sequence: 42 });
  assert.equal(parseJobReference('JOB-260817-001'), null, 'the old format is not a reference');
});

test('the sequence widens past 999 rather than wrapping', () => {
  assert.equal(nextJobReference(['ABC-999'], 'ABC'), 'ABC-1000');
});

test('a company page reads newest first', () => {
  const jobs = [
    { jobReference: 'ABC-001', domain: 'IMPORT' as const, createdDate: '2026-08-01', status: 'Completed' },
    { jobReference: 'ABC-003', domain: 'EXPORT' as const, createdDate: '2026-09-01', status: 'Awaiting CMS' },
    { jobReference: 'ABC-002', domain: 'IMPORT' as const, createdDate: '2026-08-15', status: 'Delivered' },
  ];
  assert.deepEqual(sortCustomerJobs(jobs).map((j) => j.jobReference), ['ABC-003', 'ABC-002', 'ABC-001']);
});
