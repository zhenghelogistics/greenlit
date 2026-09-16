import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByCustomer, matchCustomer } from '../src/customer-matching.ts';

// The real consignee blocks from the notices operations sent.
const DKSH = { code: 'DOJ', companyName: 'DKSH SINGAPORE PTE LTD', emailDomains: ['@dksh.com'] };
const PEPSI = { code: 'PEP', companyName: 'PepsiCo International Pte. Ltd.', shortName: 'PepsiCo' };
const CUSTOMERS = [DKSH, PEPSI];

test('§9: a consignee block names its company', () => {
  assert.equal(
    matchCustomer('DKSH SINGAPORE PTE LTD 47 JALAN BUROH SINGAPORE 619491', CUSTOMERS)?.customer.code,
    'DOJ');
});

test('§9: case and spacing are not identity', () => {
  // "DKSH Singapore Pte Ltd" and "DKSH SINGAPORE PTE LTD" are one company.
  assert.equal(matchCustomer('dksh  singapore   pte ltd', CUSTOMERS)?.customer.code, 'DOJ');
});

test('§9: a short name matches when the full name does not', () => {
  const hit = matchCustomer('PEPSICO INTERNATIONAL PTE LTD, DUO TOWER', CUSTOMERS);
  // The stored name has periods the document does not, so the full name misses
  // and the short name catches it.
  assert.equal(hit?.customer.code, 'PEP');
  assert.equal(hit?.matchedOn, 'shortName');
});

test('§9: an email domain is the weakest signal and says so', () => {
  const hit = matchCustomer('SG_CG_DOC@DKSH.COM', [
    { code: 'DOJ', companyName: 'Some Other Registered Name', emailDomains: ['@dksh.com'] },
  ]);
  assert.equal(hit?.matchedOn, 'emailDomain');
});

test('§9: a company name beats a domain when both could match', () => {
  // Two companies can share a parent's domain, so the name is checked first.
  const hit = matchCustomer('PepsiCo International Pte. Ltd.', [
    { code: 'AAA', companyName: 'Unrelated', emailDomains: ['pepsico'] },
    PEPSI,
  ]);
  assert.equal(hit?.customer.code, 'PEP');
  assert.equal(hit?.matchedOn, 'name');
});

test('§9: an unknown consignee is a new customer, not a failure', () => {
  assert.equal(matchCustomer('SOME NEW SHIPPER PTE LTD', CUSTOMERS), null);
  assert.equal(matchCustomer('', CUSTOMERS), null);
  assert.equal(matchCustomer('DKSH', []), null);
});

test('§9: a batch divides into companies, unknowns and blanks', () => {
  // The answer an operator wants before applying twenty notices.
  const docs = [
    { id: 1, consignee: 'DKSH SINGAPORE PTE LTD' },
    { id: 2, consignee: 'DKSH Singapore Pte Ltd, 151 Lorong Chuan' },
    { id: 3, consignee: 'PepsiCo International Pte. Ltd.' },
    { id: 4, consignee: 'BRAND NEW CUSTOMER PTE LTD' },
    { id: 5, consignee: 'BRAND NEW CUSTOMER PTE LTD' },
    { id: 6, consignee: '' },
  ];
  const grouped = groupByCustomer(docs, (d) => d.consignee, CUSTOMERS);

  assert.equal(grouped.matched.length, 2);
  assert.equal(grouped.matched.find((m) => m.customer.code === 'DOJ')?.documents.length, 2,
    'two notices for one company are one group, not two rows');
  assert.equal(grouped.unmatched.length, 1, 'one new company, named twice');
  assert.equal(grouped.unmatched[0]?.documents.length, 2);
  assert.equal(grouped.unnamed.length, 1);
});

test('§9: an empty batch groups into nothing rather than throwing', () => {
  const grouped = groupByCustomer([], () => '', CUSTOMERS);
  assert.deepEqual(grouped.matched, []);
  assert.deepEqual(grouped.unmatched, []);
  assert.deepEqual(grouped.unnamed, []);
});
