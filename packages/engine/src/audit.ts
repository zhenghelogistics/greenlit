import type { AuditSource } from './enums.ts';

/**
 * §13. Audit and events.
 *
 * One audit stream serves both domains. The rules that make it useful rather
 * than merely present:
 *
 *   - System-generated changes must NAME THE RULE that produced them. "System
 *     set status to Awaiting T/T" is not sufficient; "Rule 13, VGM received
 *     and transhipment pending" is auditable.
 *   - Critical events cannot be deleted or edited by standard users.
 *   - The stream is immutable: a wrong entry is corrected by a further entry.
 */

export type AuditEntityType = 'job' | 'container' | 'movement' | 'document' | 'exception';

export interface AuditEvent {
  /** Event type, from AUDIT_EVENTS. */
  event: string;
  entityType: AuditEntityType;
  entityId: string;
  /** Set where a specific field changed. */
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  /** A named user, or 'System'. Never a shared account. */
  actor: string;
  source: AuditSource;
  /**
   * §13. Required when source is SYSTEM_RULE: the rule that produced the
   * change, e.g. "§45.2 rule 13, VGM received and transhipment pending".
   */
  rule: string | null;
  createdAt: string;
}

/**
 * §13, "Minimum recorded events". Listed verbatim so the catalogue is
 * checkable against the specification rather than growing ad hoc.
 */
export const AUDIT_EVENTS = [
  'job.created', 'job.completed', 'job.reopened',
  'job.mandatoryFieldChanged',
  'permit.received', 'portnet.released', 'cms.completed',
  'movement.created', 'movement.scheduled', 'movement.assigned',
  'movement.collected', 'movement.delivered', 'movement.completed',
  'movement.cancelled',
  'container.identityCaptured', 'container.detailsEmailed',
  'container.readyConfirmed', 'vgm.received',
  'transhipment.changed', 'carpark.requested', 'empty.returned',
  'document.attached', 'document.superseded',
  'discrepancy.raised', 'discrepancy.resolved',
  'exception.raised', 'exception.resolved',
  'status.overridden', 'gate.overridden',
] as const;
export type AuditEventName = (typeof AUDIT_EVENTS)[number];

/**
 * §13. Critical events cannot be deleted or edited by standard users.
 *
 * These are the ones that establish accountability: an override, a resolution,
 * a closure. Losing one hides a decision someone made.
 */
export const CRITICAL_AUDIT_EVENTS: readonly string[] = [
  'gate.overridden', 'status.overridden',
  'discrepancy.resolved', 'exception.resolved',
  'job.completed', 'job.reopened',
  'movement.cancelled',
];

export function isCriticalAuditEvent(event: string): boolean {
  return CRITICAL_AUDIT_EVENTS.includes(event);
}

/** §13. Standard users may never delete or edit a critical event. */
export function canModifyAuditEvent(
  event: AuditEvent,
  actorRole: 'ADMINISTRATOR' | 'CONTROLLER' | 'MANAGER',
): { allowed: boolean; reason: string | null } {
  if (isCriticalAuditEvent(event.event)) {
    return { allowed: false, reason: `${event.event} is a critical audit event and cannot be modified` };
  }
  if (actorRole !== 'ADMINISTRATOR') {
    return { allowed: false, reason: 'Only an administrator may modify an audit event' };
  }
  return { allowed: true, reason: null };
}

export interface AuditEventDraft {
  event: string;
  entityType: AuditEntityType;
  entityId: string;
  field?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  rule?: string | null;
}

const asText = (v: unknown): string | null =>
  v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v);

/**
 * Build an event a person caused. The actor is a named user; §27.4 and §13
 * both forbid a shared account.
 */
export function userEvent(
  draft: AuditEventDraft, actor: string, at: string, source: AuditSource = 'USER',
): AuditEvent {
  if (!actor.trim()) throw new Error('§13: an audit event requires a named actor');
  return {
    event: draft.event,
    entityType: draft.entityType,
    entityId: draft.entityId,
    field: draft.field ?? null,
    previousValue: asText(draft.previousValue),
    newValue: asText(draft.newValue),
    actor, source, rule: draft.rule ?? null, createdAt: at,
  };
}

/**
 * Build an event the system caused. The rule is mandatory — that is the whole
 * point of §13's requirement, and making it a parameter rather than optional
 * is what stops "System changed status" from being written at all.
 */
export function systemEvent(
  draft: AuditEventDraft & { rule: string }, at: string,
): AuditEvent {
  if (!draft.rule.trim()) {
    throw new Error('§13: a system-generated audit event must name the rule that produced it');
  }
  return {
    event: draft.event,
    entityType: draft.entityType,
    entityId: draft.entityId,
    field: draft.field ?? null,
    previousValue: asText(draft.previousValue),
    newValue: asText(draft.newValue),
    actor: 'System', source: 'SYSTEM_RULE', rule: draft.rule, createdAt: at,
  };
}

/**
 * §13. "Each job renders its audit stream as a chronological narrative."
 * Oldest first, because a narrative reads forwards.
 */
export function asNarrative(events: readonly AuditEvent[]): AuditEvent[] {
  return [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** A one-line human rendering. System entries always show their rule. */
export function describe(event: AuditEvent): string {
  const change = event.field
    ? `${event.field}: ${event.previousValue ?? '(empty)'} → ${event.newValue ?? '(empty)'}`
    : event.event;
  return event.source === 'SYSTEM_RULE'
    ? `${change}. ${event.rule}`
    : change;
}
