/**
 * §7. User roles.
 *
 * Three roles. §14.1: "Server-side permission validation. Never rely solely on
 * frontend checks." So this module answers the question, and the answer is
 * used by the server — the interface may hide a control, but hiding it is a
 * courtesy, not the enforcement.
 */

export const ROLE = ['ADMINISTRATOR', 'CONTROLLER', 'MANAGER'] as const;
export type Role = (typeof ROLE)[number];

/**
 * Permissions, named after what they let someone do rather than after screens,
 * so a rule survives the interface being rearranged.
 */
export const PERMISSION = [
  // Master data and configuration — §7.1
  'user.manage', 'masterData.manage', 'thresholds.configure',

  // Operational work — §7.2
  'job.create', 'job.edit', 'job.close',
  'document.upload', 'extraction.review',
  'permit.confirm', 'portnet.confirm', 'cms.record',
  'movement.create', 'movement.schedule', 'movement.assign',
  'movement.update', 'movement.cancel',
  'container.capture', 'container.notify',
  'readiness.record', 'vgm.record', 'transhipment.record',
  'exception.manage', 'discrepancy.resolve',

  // Deliberate departures from the rules — §27.4
  'gate.override', 'job.reopen', 'status.override',

  // Reading — §7.3
  'dashboard.view', 'tracker.view', 'queue.view', 'report.export', 'audit.view',
] as const;
export type Permission = (typeof PERMISSION)[number];

const READ_ONLY: readonly Permission[] = [
  'dashboard.view', 'tracker.view', 'queue.view', 'report.export',
];

/** §7.2. Controllers do the operational work. */
const CONTROLLER_PERMISSIONS: readonly Permission[] = [
  ...READ_ONLY,
  'job.create', 'job.edit', 'job.close',
  'document.upload', 'extraction.review',
  'permit.confirm', 'portnet.confirm', 'cms.record',
  'movement.create', 'movement.schedule', 'movement.assign',
  'movement.update', 'movement.cancel',
  'container.capture', 'container.notify',
  'readiness.record', 'vgm.record', 'transhipment.record',
  'exception.manage', 'discrepancy.resolve',
];

/**
 * §7.3. "Primarily read-only." An optional permission may allow managers to
 * override blocked jobs, which is why override is grantable rather than fixed.
 */
const MANAGER_PERMISSIONS: readonly Permission[] = [...READ_ONLY, 'audit.view'];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // §7.1. Administrators may do anything, including override any gate.
  ADMINISTRATOR: PERMISSION,
  CONTROLLER: CONTROLLER_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
};

export interface Principal {
  userId: string;
  /** A named person. §13 forbids attributing a change to a shared account. */
  displayName: string;
  role: Role;
  /** §7.3. Optional grants, e.g. letting a manager override a blocked job. */
  extraPermissions?: readonly Permission[];
  active: boolean;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string | null;
}

/**
 * The single authorization question. Server-side callers ask this; the
 * interface may also ask it to decide what to show, but §14.1 means the
 * server's answer is the one that counts.
 */
export function can(principal: Principal | null, permission: Permission): AuthorizationResult {
  if (!principal) return { allowed: false, reason: 'Not signed in' };
  if (!principal.active) return { allowed: false, reason: 'This account has been disabled' };

  const granted = ROLE_PERMISSIONS[principal.role];
  if (granted.includes(permission)) return { allowed: true, reason: null };
  if (principal.extraPermissions?.includes(permission)) return { allowed: true, reason: null };

  return {
    allowed: false,
    reason: `A ${principal.role.toLowerCase()} may not ${permission.replace('.', ' ')}`,
  };
}

/** Throwing form, for use at a command boundary where a refusal is an error. */
export function requirePermission(principal: Principal | null, permission: Permission): void {
  const result = can(principal, permission);
  if (!result.allowed) throw new Error(result.reason ?? 'Not permitted');
}

/**
 * §27.4. Every override records who, when, what and why — and the reason is
 * mandatory with a minimum length, because "override" on its own explains
 * nothing to whoever reads it later.
 */
export interface OverrideRequest {
  principal: Principal | null;
  gate: string;
  reason: string;
  at: string;
}

export const MINIMUM_OVERRIDE_REASON_LENGTH = 12;

export function validateOverride(request: OverrideRequest): AuthorizationResult {
  const permitted = can(request.principal, 'gate.override');
  if (!permitted.allowed) return permitted;

  if ((request.reason ?? '').trim().length < MINIMUM_OVERRIDE_REASON_LENGTH) {
    return {
      allowed: false,
      reason: `§27.4: an override requires a reason of at least ${MINIMUM_OVERRIDE_REASON_LENGTH} characters`,
    };
  }
  return { allowed: true, reason: null };
}

/** §7. Roles are assigned by an administrator, never self-selected. */
export function canAssignRole(principal: Principal | null): AuthorizationResult {
  return can(principal, 'user.manage');
}
