/**
 * §7. User roles.
 *
 * Two roles do the business's work, and one exists for whoever maintains the
 * system. §14.1: "Server-side permission validation. Never rely solely on
 * frontend checks." So this module answers the question and the server uses
 * the answer — the interface may hide a control, but hiding it is a courtesy,
 * not the enforcement.
 *
 * OPERATIONS runs the book: create a job, work it, amend it while it is
 * running, close it when it is done.
 *
 * MANAGEMENT is everything operations can do and one thing more: reopening a
 * job that has been closed. That is the line, and it is drawn there because
 * closing is what makes a job billable. Amending a running job changes what
 * will be invoiced; amending a closed one changes what already has been, and
 * those are different acts however similar the screen looks.
 *
 * The previous model had three roles and had MANAGER read-only, so a manager
 * could not create a job or close one — which is not what a manager does.
 */

export const ROLE = ['ADMINISTRATOR', 'MANAGEMENT', 'CONTROLLER', 'OPERATIONS'] as const;
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

  /**
   * §14.4. Seeing the machinery when something breaks.
   *
   * Error references, failure detail and the stack behind a broken screen.
   * Held by whoever maintains the system, and deliberately not by management:
   * a director reading "Cannot read properties of undefined" learns nothing
   * they can act on and loses confidence in a system that is working.
   * Operations and controllers get the sentence about what to do instead.
   */
  'diagnostics.view',
] as const;
export type Permission = (typeof PERMISSION)[number];

const READ_ONLY: readonly Permission[] = [
  'dashboard.view', 'tracker.view', 'queue.view', 'report.export',
];

/** §7.2. Operations runs the book, start to close. */
const OPERATIONS_PERMISSIONS: readonly Permission[] = [
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
 * §7.2. The controller works the fleet rather than the paperwork.
 *
 * Everything about moving boxes — planning, scheduling, assigning a driver,
 * updating and cancelling a trip — and the checkpoints that gate a movement.
 * Not job creation or document intake: an assistant prepares a job until its
 * information is complete, and the controller takes it from there.
 *
 * The split is by the work, not by seniority. A controller is not a junior
 * manager and an assistant is not a junior controller; they are two halves of
 * one operation, and each is senior in their own half.
 */
const CONTROLLER_PERMISSIONS: readonly Permission[] = [
  ...READ_ONLY,
  'job.edit',
  'movement.create', 'movement.schedule', 'movement.assign',
  'movement.update', 'movement.cancel',
  'permit.confirm', 'portnet.confirm',
  'readiness.record', 'transhipment.record',
  'container.capture', 'container.notify',
  'exception.manage',
];

/**
 * §7.3. Everything operations can do, plus the departures from the rules.
 *
 * job.reopen is the one that matters. A closed job has been billed, so
 * reopening it is a commercial act rather than an operational one, and it is
 * the reason this role exists as something other than a job title.
 *
 * The overrides sit here for the same reason: gate.override releases a
 * container the rules say is not releasable, and status.override asserts a
 * status the evidence does not support. Both are legitimate and both should
 * cost a conversation.
 */
const MANAGEMENT_PERMISSIONS: readonly Permission[] = [
  ...OPERATIONS_PERMISSIONS,
  ...CONTROLLER_PERMISSIONS,
  'audit.view',
  'job.reopen',
  'gate.override',
  'status.override',
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // §7.1. Administrators may do anything. Held by whoever maintains the
  // system rather than by anyone running the book.
  ADMINISTRATOR: PERMISSION,
  MANAGEMENT: MANAGEMENT_PERMISSIONS,
  CONTROLLER: CONTROLLER_PERMISSIONS,
  OPERATIONS: OPERATIONS_PERMISSIONS,
};

/**
 * §7. Which screen this person opens on.
 *
 * Not a preference and not a toggle: the screens answer different questions
 * and a person does one of the jobs. A controller landing on the assistant's
 * job-preparation board would have to navigate away from it every morning.
 *
 * Management lands on the overview because their question is how the
 * operation is doing, not which box moves next.
 */
export function homeScreenFor(role: Role): 'controller' | 'dashboard' {
  return role === 'CONTROLLER' ? 'controller' : 'dashboard';
}

export interface Principal {
  userId: string;
  /** A named person. §13 forbids attributing a change to a shared account. */
  displayName: string;
  role: Role;
  /**
   * §7. What this person signs in with.
   *
   * The directory has always said who may do what; it never said who anyone
   * is. The actor arrived in the request body, so the roles were enforced
   * against a claim rather than an identity — anyone could send
   * actor: "john" and be an administrator. A verified session carries an
   * email, and this is what it resolves against.
   *
   * Null for a principal with no account yet: the directory can name someone
   * before they can sign in, which is how a new controller is set up before
   * their first day rather than during it.
   */
  email: string | null;
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
    reason: `${ROLE_LABEL[principal.role]} may not ${PERMISSION_LABEL[permission] ?? permission}`,
  };
}

/**
 * How a role reads in a sentence.
 *
 * The message used to be built as `A ${role.toLowerCase()}`, which read fine
 * for "a controller" and produced "A management may not masterData manage"
 * the moment the roles were renamed. A refusal a person cannot parse is a
 * refusal they will escalate.
 */
const ROLE_LABEL: Record<Role, string> = {
  ADMINISTRATOR: 'An administrator',
  MANAGEMENT: 'Management',
  CONTROLLER: 'A controller',
  OPERATIONS: 'Operations',
};

/**
 * What a permission means, for the person being refused.
 *
 * Only the ones a person actually hits. Anything unlisted falls back to its
 * own name, which is ugly but honest — better than a wrong friendly label.
 */
const PERMISSION_LABEL: Partial<Record<Permission, string>> = {
  'job.reopen': 'reopen a completed job — ask management, since reopening changes what has been billed',
  'gate.override': 'override a blocked gate',
  'status.override': 'set a status the evidence does not support',
  'masterData.manage': 'change companies or master data',
  'user.manage': 'manage users',
  'thresholds.configure': 'change the configured thresholds',
  'job.close': 'complete a job',
  'job.edit': 'amend a job',
  'job.create': 'create a job',
};

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

/**
 * §7.1. Why a role change is refused, or null when it is fine.
 *
 * Two ways to lock the operation out of its own directory, both of which look
 * like ordinary edits at the moment they are made.
 *
 * The first is demoting yourself. Only ADMINISTRATOR holds user.manage, so an
 * administrator who sets their own role to CONTROLLER loses the screen they
 * would use to set it back. Nothing errors — they simply cannot undo it, and
 * the fix is someone else's account or a hand-written SQL statement.
 *
 * The second is removing the last one. If every administrator steps down in
 * turn, each step is legal and the end state has nobody who can add users,
 * change roles or configure thresholds. There is no way back in through the
 * application at all.
 *
 * Neither is a permission question — the person genuinely holds user.manage —
 * so neither is caught by `can`. They are guarded here because this is where
 * the consequence is knowable.
 */
export function roleChangeProblem(
  actor: Principal,
  targetUserId: string,
  nextRole: Role,
  /** How many active administrators exist right now, including the target. */
  administratorCount: number,
): string | null {
  const isSelf = actor.userId === targetUserId;

  if (isSelf && actor.role === 'ADMINISTRATOR' && nextRole !== 'ADMINISTRATOR') {
    return 'You cannot change your own role away from administrator: only an '
      + 'administrator can change roles, so you would not be able to change it '
      + 'back. Ask another administrator to do it.';
  }

  if (actor.role === 'ADMINISTRATOR' && nextRole !== 'ADMINISTRATOR'
    && administratorCount <= 1) {
    return 'This is the last administrator. Promote someone else first, or the '
      + 'directory will have nobody who can manage users.';
  }

  return null;
}
