import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  can, canAssignRole, requirePermission, validateOverride,
  MINIMUM_OVERRIDE_REASON_LENGTH, type Principal,
} from '../src/roles.ts';

const who = (role: Principal['role'], o: Partial<Principal> = {}): Principal => ({
  userId: 'u1', displayName: 'Sarah Lim', role, active: true, ...o,
});

test('§7.1: an administrator may configure and override', () => {
  const admin = who('ADMINISTRATOR');
  assert.equal(can(admin, 'user.manage').allowed, true);
  assert.equal(can(admin, 'thresholds.configure').allowed, true);
  assert.equal(can(admin, 'gate.override').allowed, true);
  assert.equal(can(admin, 'job.reopen').allowed, true);
});

test('§7.2: a controller does the operational work', () => {
  const c = who('CONTROLLER');
  for (const p of ['job.create', 'movement.schedule', 'container.capture',
    'vgm.record', 'transhipment.record', 'discrepancy.resolve'] as const) {
    assert.equal(can(c, p).allowed, true, `a controller must be able to ${p}`);
  }
});

test('§7.2: a controller may not override a gate or reopen a job', () => {
  const c = who('CONTROLLER');
  assert.equal(can(c, 'gate.override').allowed, false,
    'controllers should not normally bypass a gate');
  assert.equal(can(c, 'job.reopen').allowed, false);
  assert.equal(can(c, 'user.manage').allowed, false);
});

test('§7.3: a manager is primarily read-only', () => {
  const m = who('MANAGER');
  assert.equal(can(m, 'dashboard.view').allowed, true);
  assert.equal(can(m, 'report.export').allowed, true);
  assert.equal(can(m, 'job.edit').allowed, false);
  assert.equal(can(m, 'movement.create').allowed, false);
});

test('§7.3: a manager may be granted override as an optional permission', () => {
  const m = who('MANAGER', { extraPermissions: ['gate.override'] });
  assert.equal(can(m, 'gate.override').allowed, true);
  assert.equal(can(m, 'job.edit').allowed, false, 'the grant is narrow, not blanket');
});

test('nobody signed in may do anything', () => {
  assert.equal(can(null, 'dashboard.view').allowed, false);
  assert.match(can(null, 'job.edit').reason ?? '', /Not signed in/);
});

test('a disabled account is refused even with the right role', () => {
  const disabled = who('ADMINISTRATOR', { active: false });
  assert.equal(can(disabled, 'dashboard.view').allowed, false);
  assert.match(can(disabled, 'user.manage').reason ?? '', /disabled/);
});

test('a refusal explains itself', () => {
  const r = can(who('MANAGER'), 'movement.cancel');
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? '', /manager may not/);
});

test('requirePermission throws at a command boundary', () => {
  assert.throws(() => requirePermission(who('MANAGER'), 'job.edit'), /may not/);
  assert.doesNotThrow(() => requirePermission(who('CONTROLLER'), 'job.edit'));
});

test('§27.4: an override requires a substantive reason', () => {
  const admin = who('ADMINISTRATOR');
  const short = validateOverride({ principal: admin, gate: 'collection', reason: 'ok', at: 'now' });
  assert.equal(short.allowed, false);
  assert.match(short.reason ?? '', new RegExp(String(MINIMUM_OVERRIDE_REASON_LENGTH)));

  const good = validateOverride({
    principal: admin, gate: 'collection',
    reason: 'Manual release confirmation received from the operations manager',
    at: 'now',
  });
  assert.equal(good.allowed, true);
});

test('§27.4: a reason cannot rescue someone who may not override', () => {
  const r = validateOverride({
    principal: who('CONTROLLER'), gate: 'collection',
    reason: 'Manual release confirmation received from the operations manager',
    at: 'now',
  });
  assert.equal(r.allowed, false, 'permission is checked before the reason');
});

test('§7: roles are assigned by an administrator, never self-selected', () => {
  assert.equal(canAssignRole(who('ADMINISTRATOR')).allowed, true);
  assert.equal(canAssignRole(who('CONTROLLER')).allowed, false);
  assert.equal(canAssignRole(who('MANAGER')).allowed, false);
});
