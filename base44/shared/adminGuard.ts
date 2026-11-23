import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

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

  return { base44, user, service: base44.asServiceRole };
}

export const adminFailure = (label, error, message) => {
  console.error(`${label} failed`, error?.message);
  return Response.json({ error: message }, { status: 500 });
};