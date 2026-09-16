import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  can, canAssignRole, requirePermission, validateOverride, homeScreenFor, roleChangeProblem,
  MINIMUM_OVERRIDE_REASON_LENGTH, type Principal,
} from '../src/roles.ts';
import { canJoin, joiningRole, suggestedUserId, suggestedDisplayName } from '../src/joining.ts';

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

/**
 * §7. Registration is self-service; the role is not.
 */
test('§7: only company addresses may register', () => {
  // A signed-in person can see every job, customer and container. There is no
  // approval step behind registration, so the domain is the gate.
  assert.equal(canJoin('sarah@zhenghe.com.sg').ok, true);
  assert.equal(canJoin('SARAH@ZhengHe.com.sg').ok, true, 'case is not identity');
  assert.equal(canJoin('sarah@gmail.com').ok, false);
  assert.equal(canJoin('sarah@zhenghe.com.sg.attacker.com').ok, false,
    'a domain that merely contains ours is not ours');
  assert.equal(canJoin('not-an-address').ok, false);
  assert.match(canJoin('sarah@gmail.com').reason ?? '', /work address/);
});

test('§7: everyone joins as operations except the founding administrator', () => {
  // Somebody has to be able to promote the first person, and that cannot
  // itself require a promotion.
  assert.equal(joiningRole('max-ng@zhenghe.com.sg'), 'ADMINISTRATOR');
  assert.equal(joiningRole('MAX-NG@zhenghe.com.sg'), 'ADMINISTRATOR');
  assert.equal(joiningRole('sarah@zhenghe.com.sg'), 'OPERATIONS');
  assert.equal(joiningRole('mei@zhenghe.com.sg'), 'OPERATIONS',
    'management is granted by an administrator, never claimed at registration');
});

test('§7: a username and a name are derived so nobody invents one', () => {
  assert.equal(suggestedUserId('max-ng@zhenghe.com.sg'), 'max-ng');
  assert.equal(suggestedUserId('sarah.lim@zhenghe.com.sg'), 'sarah.lim');
  assert.equal(suggestedDisplayName('sarah.lim@zhenghe.com.sg'), 'Sarah Lim');
  assert.equal(suggestedDisplayName('max-ng@zhenghe.com.sg'), 'Max Ng');
  // §13 puts the display name on every change, so it can never be empty.
  assert.ok(suggestedDisplayName('x@zhenghe.com.sg').length > 0);
  assert.ok(suggestedUserId('!!!@zhenghe.com.sg').length > 0);
});

const asRole = (role: Parameters<typeof homeScreenFor>[0]): Principal => ({
  userId: 'u', displayName: 'Test', role, email: null, active: true,
});
const may = (role: Parameters<typeof homeScreenFor>[0], permission: Parameters<typeof can>[1]) =>
  can(asRole(role), permission).allowed;

test('§7: a controller moves boxes and does not open the book', () => {
  // The split is the work, not seniority. Planning, scheduling and assigning
  // are theirs; creating a job and reading documents belong to the assistant
  // who prepares it.
  assert.equal(may('CONTROLLER', 'movement.schedule'), true);
  assert.equal(may('CONTROLLER', 'movement.assign'), true);
  assert.equal(may('CONTROLLER', 'portnet.confirm'), true);

  assert.equal(may('CONTROLLER', 'job.create'), false);
  assert.equal(may('CONTROLLER', 'document.upload'), false);
  assert.equal(may('CONTROLLER', 'job.close'), false);
  assert.equal(may('CONTROLLER', 'job.reopen'), false,
    'reopening a billed job stays a commercial act');
});

test('§7: management covers both halves of the operation', () => {
  for (const p of ['movement.schedule', 'job.create', 'job.close', 'job.reopen']) {
    assert.equal(may('MANAGEMENT', p as Parameters<typeof can>[1]), true, `management should hold ${p}`);
  }
});

test('§14.4: only an administrator sees the machinery', () => {
  // A director reading a stack trace learns nothing they can act on and loses
  // confidence in a system that is working. Everyone else gets the sentence
  // about what to do.
  assert.equal(may('ADMINISTRATOR', 'diagnostics.view'), true);
  assert.equal(may('MANAGEMENT', 'diagnostics.view'), false);
  assert.equal(may('CONTROLLER', 'diagnostics.view'), false);
  assert.equal(may('OPERATIONS', 'diagnostics.view'), false);
});

test('§7: a controller lands on the fleet, everyone else on the overview', () => {
  assert.equal(homeScreenFor('CONTROLLER'), 'controller');
  assert.equal(homeScreenFor('OPERATIONS'), 'dashboard');
  assert.equal(homeScreenFor('MANAGEMENT'), 'dashboard');
});

test('§7.1: an administrator cannot demote themselves into a corner', () => {
  // Only ADMINISTRATOR holds user.manage, so stepping down removes the screen
  // you would use to step back up. Nothing errors; it simply cannot be undone.
  const me = asRole('ADMINISTRATOR');
  const problem = roleChangeProblem(me, me.userId, 'CONTROLLER', 3);
  assert.match(problem ?? '', /would not be able to change it back/);
});

test('§7.1: an administrator may still be promoted to administrator', () => {
  const me = asRole('ADMINISTRATOR');
  assert.equal(roleChangeProblem(me, me.userId, 'ADMINISTRATOR', 3), null);
});

test('§7.1: the last administrator cannot be stood down', () => {
  // Each step is legal on its own and the end state has nobody who can add a
  // user, change a role or configure a threshold.
  const me = asRole('ADMINISTRATOR');
  assert.match(roleChangeProblem(me, 'someone-else', 'OPERATIONS', 1) ?? '',
    /last administrator/);
  assert.equal(roleChangeProblem(me, 'someone-else', 'OPERATIONS', 2), null);
});

test('§7.1: changing somebody else is ordinary work', () => {
  const me = asRole('ADMINISTRATOR');
  assert.equal(roleChangeProblem(me, 'sarah', 'CONTROLLER', 2), null);
});
