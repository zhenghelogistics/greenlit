import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultLocation, doubleMountingProblem, locationProblem, selectableLocations,
} from '../src/locations.ts';

const site = (o: Partial<Parameters<typeof doubleMountingProblem>[0] & object> = {}) => ({
  locationId: 'l1', customerCode: 'ABC', label: 'Tuas warehouse',
  address: '12 Tuas Ave 10', isDefault: false,
  doubleMountingPermitted: true, standbyUsual: false, active: true,
  ...o,
}) as never;

test('§9.3: an inactive site stays on the record but is not offered', () => {
  // Old jobs point at it, and a job's history should still say where it went.
  const sites = [site(), site({ locationId: 'l2', active: false })];
  assert.equal(selectableLocations(sites).length, 1);
});

test('§9.3: a new job starts on the default', () => {
  const sites = [
    site({ locationId: 'l1', label: 'Tuas' }),
    site({ locationId: 'l2', label: 'Jurong', isDefault: true }),
  ];
  assert.equal(defaultLocation(sites)?.label, 'Jurong');
});

test('§9.3: one site needs no default', () => {
  assert.equal(defaultLocation([site({ label: 'Only one' })])?.label, 'Only one');
});

test('§9.3: three sites and no default means ask, not guess', () => {
  // Guessing between warehouses sends a container to the wrong one.
  const sites = [site({ locationId: 'a' }), site({ locationId: 'b' }), site({ locationId: 'c' })];
  assert.equal(defaultLocation(sites), null);
});

test('§9.3: an inactive default is not a default', () => {
  assert.equal(defaultLocation([site({ isDefault: true, active: false })]), null);
});

test('§19.1: a double mount needs both ends to permit it', () => {
  // This was §57 gap 2.1-3 — the flag existed and nothing read it, so a double
  // mount could be planned into a site that cannot receive one, which is
  // discovered by a driver at the gate with two containers on.
  const open = site({ label: 'Tuas', doubleMountingPermitted: true });
  const tight = site({ label: 'Jurong', doubleMountingPermitted: false });

  assert.equal(doubleMountingProblem(open, open), null);
  assert.match(doubleMountingProblem(open, tight) ?? '', /Jurong cannot receive/);
  assert.match(doubleMountingProblem(tight, open) ?? '', /Jurong cannot receive/);
  assert.match(
    doubleMountingProblem(tight, site({ label: 'Pioneer', doubleMountingPermitted: false })) ?? '',
    /Neither Jurong nor Pioneer/);
});

test('§19.1: an unknown end cannot refuse a double mount', () => {
  // A site not in the master is not evidence that it is unsuitable, and
  // refusing on absence would block work that is fine.
  assert.equal(doubleMountingProblem(null, null), null);
  assert.equal(doubleMountingProblem(site(), null), null);
});

test('§9.3: a site needs a name and an address', () => {
  assert.match(locationProblem({ address: '12 Tuas' }) ?? '', /name the customer would recognise/);
  assert.match(locationProblem({ label: 'Tuas' }) ?? '', /nobody can be sent to it/);
  assert.equal(locationProblem({ label: 'Tuas', address: '12 Tuas Ave 10' }), null);
});
