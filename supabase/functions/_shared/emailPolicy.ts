/**
 * Single gate for outbound email and for the connected Gmail account.
 *
 * Policy (in force until customer authentication and role-based permissions
 * are fully implemented):
 *   - Only Admin users may send email or read the Gmail connector token.
 *   - Agent task runs, chat and every other AI or visitor flow never send mail
 *     and never touch the Gmail connection, even indirectly.
 *   - The single exception is the public enquiry form: it sends two fixed
 *     templates through the platform mailer (a studio notification and the
 *     visitor's own acknowledgement). No caller-chosen recipient, template,
 *     subject or body is accepted, and the Gmail connection is still never used.
 *   - The Gmail token is read ONLY after requireAdmin() has passed, so there is
 *     no code path that reaches it as a visitor or as an AI agent step.
 */

export const ADMIN_ROLE = 'admin';

/** Label stored on records when an email was intentionally suppressed. */
export const VISITOR_EMAIL_SUPPRESSED = 'suppressed:admin_only_policy';

/** Set to false only once signed-in customer accounts and roles exist. */
export const VISITOR_EMAIL_LOCKED = true;

export function isAdmin(user) {
  return Boolean(user) && user.role === ADMIN_ROLE;
}

/**
 * Throws unless the caller is a signed-in Admin. Every email send and every
 * Gmail token read must call this first.
 */
export function requireAdmin(user, action = 'send email') {
  if (!user) {
    throw Object.assign(new Error('Sign in as an Admin to continue.'), { status: 401 });
  }
  if (!isAdmin(user)) {
    throw Object.assign(new Error(`Only Admin users may ${action}.`), { status: 403 });
  }
  return user;
}

/**
 * The only supported way to reach the Gmail connection. Requires an Admin user
 * and an explicit call site, so no agent step or visitor flow can obtain it.
 */
export async function adminGmailConnection(base44, user) {
  requireAdmin(user, 'use the connected Gmail account');
  return base44.asServiceRole.connectors.getConnection('gmail');
}

/**
 * Visitor-triggered flows use this instead of sending: it records that mail was
 * deliberately suppressed rather than silently pretending to have sent.
 */
export function suppressedStatus() {
  return VISITOR_EMAIL_LOCKED ? VISITOR_EMAIL_SUPPRESSED : 'not_sent';
}