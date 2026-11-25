import { createClientFromRequest } from './base44shim.ts';

// Every super admin endpoint re-checks the caller's role on the server, so the
// admin area is never protected by hidden navigation alone. Returns either a
// ready-made error response or the clients the endpoint needs.
export async function adminContext(req) {
  const base44 = createClientFromRequest(req);
  // Any failure to resolve a caller means "not signed in" as far as the admin
  // console is concerned: the request is refused before any record is read.
  const user = await base44.auth.me().catch(() => null);

  if (!user) {
    return { response: Response.json({ error: 'Please sign in.' }, { status: 401 }) };
  }
  if (user.role !== 'admin') {
    return { response: Response.json({ error: 'Super admin access only.' }, { status: 403 }) };
  }
  // Two-step sign-in is required for the admin console. The token was just verified by
  // auth.me(), so its assurance level (aal) can be read from it.
  if (Deno.env.get('ADMIN_MFA_REQUIRED') !== 'false') {
    let aal = '';
    try {
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      aal = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal || '';
    } catch { /* treated as not verified */ }
    if (aal !== 'aal2') {
      return { response: Response.json({ error: 'Turn on two-step sign-in (Account → Security) to use the admin console.', code: 'mfa_required' }, { status: 403 }) };
    }
  }

  return { base44, user, service: base44.asServiceRole };
}

export const adminFailure = (label, error, message) => {
  console.error(`${label} failed`, error?.message);
  return Response.json({ error: message }, { status: 500 });
};