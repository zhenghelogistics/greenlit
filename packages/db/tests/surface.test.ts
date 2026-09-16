import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseRepository } from '../src/supabase.ts';
import { createMemoryRepository } from '@greenlit/core';
import { toImportContainer } from '../src/rows.ts';

/**
 * Structural checks that need no database.
 *
 * The behavioural proof is the contract suite in @greenlit/core, which this
 * adapter must pass against a real Supabase project. These catch the cheaper
 * failure first: a method the port declares and the adapter forgot, which
 * would otherwise surface as a runtime crash on whichever screen used it.
 */
const adapter = createSupabaseRepository({
  url: 'https://example.supabase.co',
  serviceRoleKey: 'not-a-real-key',
});

test('the adapter implements every method the in-memory one does', () => {
  const expected = Object.keys(createMemoryRepository()).sort();
  const actual = Object.keys(adapter).sort();
  const missing = expected.filter((k) => !actual.includes(k));
  assert.deepEqual(missing, [],
    `the Supabase adapter is missing: ${missing.join(', ')}`);
});

test('every member of the port is callable', () => {
  for (const [name, value] of Object.entries(adapter)) {
    assert.equal(typeof value, 'function', `${name} must be a function`);
  }
});

test('§54: no adapter may expose a setter for a derived value', () => {
  // The same assertion the contract suite makes, checked here too because a
  // new adapter is exactly where such a method would be added by accident.
  for (const forbidden of ['setJobStatus', 'setNextAction', 'setLocation',
    'setWaitingOn', 'setContainerStatus', 'setCollectionEligible']) {
    assert.equal((adapter as unknown as Record<string, unknown>)[forbidden], undefined,
      `${forbidden} must not exist`);
  }
  assert.ok(Object.keys(adapter).every((k) => !/^set[A-Z]/.test(k)));
});

test('§13: the port offers no way to edit or delete an audit event', () => {
  for (const forbidden of ['updateAuditEvent', 'deleteAuditEvent', 'clearAuditEvents']) {
    assert.equal((adapter as unknown as Record<string, unknown>)[forbidden], undefined,
      `${forbidden} must not exist: critical audit events cannot be deleted or edited`);
  }
});

test('§34.2: a numeric rate from REST is mapped to a number, not its string', () => {
  // Postgres `numeric` is returned by PostgREST as a JSON string, to preserve
  // a precision JavaScript numbers do not have. The charge estimate multiplies
  // this figure: '85.50' * 4 is 342, but '85.50' + 4 is '85.504'. Only one of
  // those two is ever an accident, and it is the one that reaches a customer.
  //
  // No database needed to prove it: this is the mapper's own arithmetic, and
  // the contract suite that would prove it end to end writes to the live
  // project.
  const container = toImportContainer({
    container_id: 'c-1', job_id: 'j-1', container_number: 'MSKU1234567',
    daily_rate: '85.50', currency: 'SGD',
  });

  assert.equal(typeof container.dailyRate, 'number');
  assert.equal(container.dailyRate, 85.5);
  assert.equal(container.dailyRate! * 4, 342);
  assert.equal(container.currency, 'SGD');
});

test('§34.2: no rate on file maps to null, never to zero', () => {
  // A zero rate is a statement that the carrier charges nothing. An absent one
  // is a statement that nobody has filed the tariff. The screen says something
  // different for each.
  const container = toImportContainer({
    container_id: 'c-2', job_id: 'j-1', container_number: 'MSKU7654321',
    daily_rate: null, currency: null,
  });
  assert.equal(container.dailyRate, null);
  assert.equal(container.currency, null);
});
