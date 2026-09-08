import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_EVENTS, CRITICAL_AUDIT_EVENTS, asNarrative, canModifyAuditEvent,
  describe as describeEvent, isCriticalAuditEvent, systemEvent, userEvent,
} from '../src/audit.ts';

const AT = '2026-09-01T10:42:00Z';

test('§13: a user event records who, what changed, and when', () => {
  const e = userEvent({
    event: 'portnet.released', entityType: 'job', entityId: 'ij1',
    field: 'portnetReleased', previousValue: false, newValue: true,
  }, 'Sarah Lim', AT);

  assert.equal(e.actor, 'Sarah Lim');
  assert.equal(e.source, 'USER');
  assert.equal(e.previousValue, 'false');
  assert.equal(e.newValue, 'true');
  assert.equal(e.createdAt, AT);
});

test('§13: an audit event cannot be written without a named actor', () => {
  assert.throws(() => userEvent(
    { event: 'cms.completed', entityType: 'job', entityId: 'e1' }, '   ', AT),
    /named actor/);
});

test('§13: a system event MUST name the rule that produced it', () => {
  const e = systemEvent({
    event: 'transhipment.changed', entityType: 'job', entityId: 'ej1',
    field: 'jobStatus', previousValue: 'Container Ready', newValue: 'Awaiting T/T',
    rule: '§45.2 rule 13, VGM received and transhipment pending',
  }, AT);

  assert.equal(e.actor, 'System');
  assert.equal(e.source, 'SYSTEM_RULE');
  assert.match(e.rule ?? '', /rule 13/);
});

test('§13: a system event with no rule cannot be constructed at all', () => {
  assert.throws(() => systemEvent({
    event: 'transhipment.changed', entityType: 'job', entityId: 'ej1', rule: '',
  }, AT), /must name the rule/);
});

test('§13: "System set status" without a rule is exactly what this prevents', () => {
  // The PRD's own example of an insufficient entry.
  const good = systemEvent({
    event: 'transhipment.changed', entityType: 'job', entityId: 'ej1',
    field: 'jobStatus', newValue: 'Awaiting T/T',
    rule: 'Rule 13, VGM received and transhipment pending',
  }, AT);
  assert.match(describeEvent(good), /Rule 13/, 'the rendering carries the rule');
});

test('§13: critical events cannot be modified, by anyone', () => {
  const override = userEvent(
    { event: 'gate.overridden', entityType: 'job', entityId: 'ij1' }, 'John Tan', AT);
  assert.equal(isCriticalAuditEvent(override.event), true);
  assert.equal(canModifyAuditEvent(override, 'ADMINISTRATOR').allowed, false,
    'not even an administrator may edit an override record');
  assert.equal(canModifyAuditEvent(override, 'CONTROLLER').allowed, false);
});

test('§13: standard users cannot modify even non-critical events', () => {
  const ordinary = userEvent(
    { event: 'movement.scheduled', entityType: 'movement', entityId: 'm1' }, 'Winnie', AT);
  assert.equal(canModifyAuditEvent(ordinary, 'CONTROLLER').allowed, false);
  assert.equal(canModifyAuditEvent(ordinary, 'MANAGER').allowed, false);
  assert.equal(canModifyAuditEvent(ordinary, 'ADMINISTRATOR').allowed, true);
});

test('§13: the critical set covers the accountability events', () => {
  for (const e of ['gate.overridden', 'status.overridden', 'discrepancy.resolved',
    'exception.resolved', 'job.reopened']) {
    assert.ok(CRITICAL_AUDIT_EVENTS.includes(e), `${e} must be protected`);
  }
});

test('§13: the catalogue covers the minimum recorded events', () => {
  for (const e of ['job.created', 'permit.received', 'portnet.released', 'cms.completed',
    'movement.created', 'movement.cancelled', 'container.identityCaptured',
    'vgm.received', 'transhipment.changed', 'discrepancy.raised',
    'discrepancy.resolved', 'gate.overridden']) {
    assert.ok((AUDIT_EVENTS as readonly string[]).includes(e), `${e} is required by §13`);
  }
});

test('§13: the stream reads as a chronological narrative, oldest first', () => {
  const later = userEvent({ event: 'vgm.received', entityType: 'job', entityId: 'e' }, 'W', '2026-09-02T00:00:00Z');
  const earlier = userEvent({ event: 'cms.completed', entityType: 'job', entityId: 'e' }, 'W', '2026-09-01T00:00:00Z');
  const ordered = asNarrative([later, earlier]);
  assert.equal(ordered[0]?.event, 'cms.completed', 'a narrative reads forwards');
});

test('§13: a change renders with both values', () => {
  const e = userEvent({
    event: 'job.mandatoryFieldChanged', entityType: 'job', entityId: 'ij1',
    field: 'eta', previousValue: '2026-08-17', newValue: '2026-08-18',
  }, 'Brandon', AT);
  assert.equal(describeEvent(e), 'eta: 2026-08-17 → 2026-08-18');
});
