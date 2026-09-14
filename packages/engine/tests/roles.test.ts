import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  can, canAssignRole, requirePermission, validateOverride,
  MINIMUM_OVERRIDE_REASON_LENGTH, type Principal,
} from '../src/roles.ts';

const who = (role: Principal['role'], o: Partial<Principal> = {}): Principal => ({
  userId: 'u1', displayName: 'Sarah Lim', role, email: 'sarah@zhenghe.com.sg', active: true, ...o,
});

test('§7.1: an administrator may configure and override', () => {
  const admin = who('ADMINISTRATOR');
  assert.equal(can(admin, 'user.manage').allowed, true);
  assert.equal(can(admin, 'thresholds.configure').allowed, true);
  assert.equal(can(admin, 'gate.override').allowed, true);
  assert.equal(can(admin, 'job.reopen').allowed, true);
});

test('§7.2: a controller does the operational work', () => {
  const c = who('OPERATIONS');
  for (const p of ['job.create', 'movement.schedule', 'container.capture',
    'vgm.record', 'transhipment.record', 'discrepancy.resolve'] as const) {
    assert.equal(can(c, p).allowed, true, `a controller must be able to ${p}`);
  }
});

test('§7.2: a controller may not override a gate or reopen a job', () => {
  const c = who('OPERATIONS');
  assert.equal(can(c, 'gate.override').allowed, false,
    'operations should not bypass a gate without a conversation');
  assert.equal(can(c, 'job.reopen').allowed, false);
  assert.equal(can(c, 'user.manage').allowed, false);
});

test('§7.3: management works the book as well as oversees it', () => {
  // This replaced a test asserting a manager was read-only — could not edit a
  // job, could not create a movement. That described a reporting line rather
  // than a role anybody at this company holds: a manager here covers a shift.
  const m = who('MANAGEMENT');
  assert.equal(can(m, 'dashboard.view').allowed, true);
  assert.equal(can(m, 'report.export').allowed, true);
  assert.equal(can(m, 'job.edit').allowed, true);
  assert.equal(can(m, 'movement.create').allowed, true);
});

test('§7.3: an extra permission still widens one person’s access', () => {
  // Now that management holds the overrides by role, the mechanism matters for
  // the other direction: granting one operations person a single management
  // power without making them management.
  const ops = who('OPERATIONS', { extraPermissions: ['gate.override'] });
  assert.equal(can(ops, 'gate.override').allowed, true);
  assert.equal(can(ops, 'job.reopen').allowed, false, 'the grant is narrow, not blanket');
  assert.equal(can(who('OPERATIONS'), 'gate.override').allowed, false);
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
  // Aimed at master data, which management genuinely lacks. It used to aim at
  // movement.cancel, which management can now do — a test that passes because
  // a role is weak is a test that breaks when the role becomes right.
  const r = can(who('MANAGEMENT'), 'masterData.manage');
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? '', /may not/);
  assert.match(r.reason ?? '', /change companies or master data/,
    'the refusal says what was refused in words, not in a permission name');
});

test('requirePermission throws at a command boundary', () => {
  assert.throws(() => requirePermission(who('OPERATIONS'), 'job.reopen'), /may not/);
  assert.doesNotThrow(() => requirePermission(who('MANAGEMENT'), 'job.reopen'));
  assert.doesNotThrow(() => requirePermission(who('OPERATIONS'), 'job.edit'));
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
    principal: who('OPERATIONS'), gate: 'collection',
    reason: 'Manual release confirmation received from the operations manager',
    at: 'now',
  });
  assert.equal(r.allowed, false, 'permission is checked before the reason');
});

test('§7: roles are assigned by an administrator, never self-selected', () => {
  assert.equal(canAssignRole(who('ADMINISTRATOR')).allowed, true);
  assert.equal(canAssignRole(who('OPERATIONS')).allowed, false);
  assert.equal(canAssignRole(who('MANAGEMENT')).allowed, false);
});

/**
 * §7. Two roles run the book, and the line between them is closing.
 *
 * Operations works a job start to finish. Management can do all of that and
 * one thing more: reopen a job that has been closed. Closing is what makes a
 * job billable, so amending a running job changes what will be invoiced and
 * amending a closed one changes what already has been. Different acts, however
 * similar the screen looks.
 */
test('§7: operations runs a job from creation to close', () => {
  for (const permission of ['job.create', 'job.edit', 'job.close',
    'document.upload', 'movement.create', 'container.capture',
    'discrepancy.resolve', 'exception.manage'] as const) {
    assert.equal(can(who('OPERATIONS'), permission).allowed, true,
      `operations must be able to ${permission}`);
  }
});

test('§7: only management reopens a closed job', () => {
  assert.equal(can(who('OPERATIONS'), 'job.reopen').allowed, false,
    'a closed job has been billed; reopening it is a commercial act');
  assert.equal(can(who('MANAGEMENT'), 'job.reopen').allowed, true);
  assert.equal(can(who('ADMINISTRATOR'), 'job.reopen').allowed, true);
});

test('§7: management can do everything operations can', () => {
  // Management is a superset, not a different job. The previous model had
  // MANAGER read-only, so a manager could not create a job or close one.
  for (const permission of ['job.create', 'job.edit', 'job.close',
    'movement.assign', 'vgm.record', 'transhipment.record'] as const) {
    assert.equal(can(who('MANAGEMENT'), permission).allowed, true,
      `management must be able to ${permission}`);
  }
});

test('§7: the overrides are management’s, not operations’', () => {
  // Releasing a container the rules say is not releasable, and asserting a
  // status the evidence does not support. Both legitimate, both worth a
  // conversation first.
  for (const permission of ['gate.override', 'status.override'] as const) {
    assert.equal(can(who('OPERATIONS'), permission).allowed, false);
    assert.equal(can(who('MANAGEMENT'), permission).allowed, true);
  }
});

test('§7: master data stays with the administrator', () => {
  // Held by whoever maintains the system, not by anyone running the book.
  for (const permission of ['user.manage', 'masterData.manage', 'thresholds.configure'] as const) {
    assert.equal(can(who('OPERATIONS'), permission).allowed, false);
    assert.equal(can(who('MANAGEMENT'), permission).allowed, false);
    assert.equal(can(who('ADMINISTRATOR'), permission).allowed, true);
  }
});
