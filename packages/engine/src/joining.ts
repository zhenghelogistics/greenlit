/**
 * §7. Who may join, and what they get when they do.
 *
 * Registration is self-service; the role is not. Anyone at the company can
 * create their own account, and everyone who does starts as OPERATIONS — the
 * role that can run a job but cannot reopen a billed one. An administrator
 * raises individuals from there.
 *
 * That split is the whole point. A person choosing their own role has no role,
 * so the only thing registration decides is that you are staff. What being
 * staff means is written by somebody else, afterwards.
 */

/** Only company addresses. */
export const STAFF_EMAIL_DOMAIN = 'zhenghe.com.sg';

/**
 * The founding administrator.
 *
 * Somebody has to be able to promote the first person, and that cannot itself
 * require a promotion. This one address arrives as ADMINISTRATOR; every other
 * address arrives as OPERATIONS regardless of when it registers.
 */
export const FOUNDING_ADMINISTRATOR = 'max-ng@zhenghe.com.sg';

/**
 * §7. Named people who are not staff and still need in.
 *
 * A contractor building the system has to be able to sign into it. The domain
 * rule exists because a signed-in person can read every job, customer and
 * container, and there is no approval step behind registration — so the list
 * of exceptions is individual addresses, never a second domain. One address
 * lets one person in; a domain lets in whoever holds an account there next
 * year.
 *
 * It lives in code rather than configuration on purpose. Adding someone is a
 * commit with a name on it, reviewable and revertible, and it cannot be done
 * by anyone who merely has access to the deployment dashboard.
 *
 * Remove an address when the engagement ends. §7.1 lets an administrator
 * deactivate the account, and that is the immediate lever; taking the address
 * out of here is what stops them registering again.
 */
export const GUEST_ADDRESSES: readonly string[] = [
];

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * May this address register at all?
 *
 * Restricted to the company domain because a signed-in person can see every
 * job, customer and container in the system. Registration that accepted any
 * address would make the whole book readable by anyone who found the URL —
 * the gate has to be here, since there is no approval step behind it.
 */
export function canJoin(email: string): { ok: boolean; reason: string | null } {
  const address = normaliseEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { ok: false, reason: 'That does not look like an email address' };
  }
  if (GUEST_ADDRESSES.includes(address)) return { ok: true, reason: null };

  if (!address.endsWith(`@${STAFF_EMAIL_DOMAIN}`)) {
    return {
      ok: false,
      reason: `Use your @${STAFF_EMAIL_DOMAIN} work address. `
        + 'This system holds live job and customer data, so only company accounts can be created.',
    };
  }
  return { ok: true, reason: null };
}

/** What a newly registered person may do. */
export function joiningRole(email: string): 'ADMINISTRATOR' | 'OPERATIONS' {
  return normaliseEmail(email) === FOUNDING_ADMINISTRATOR ? 'ADMINISTRATOR' : 'OPERATIONS';
}

/**
 * A username from an address, so nobody has to invent one.
 *
 * The local part, punctuation flattened: max-ng@ becomes max-ng, and
 * sarah.lim@ becomes sarah.lim. Collisions get a numeric suffix at the point
 * of creation, which is the only place that can see what already exists.
 */
export function suggestedUserId(email: string): string {
  const local = normaliseEmail(email).split('@')[0] ?? '';
  const cleaned = local.replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+/, '');
  return cleaned.slice(0, 30) || 'user';
}

/**
 * A display name from an address, as a starting point.
 *
 * §13 puts this on every change the person makes, so it must never be blank.
 * A person supplies their real name at registration; this is the fallback for
 * an account that arrives without one.
 */
export function suggestedDisplayName(email: string): string {
  const local = normaliseEmail(email).split('@')[0] ?? '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || local;
}
