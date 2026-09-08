import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseRepository } from '../src/supabase.ts';
import { createMemoryRepository } from '@greenlit/core';

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
