import { createClientFromRequest } from '../_shared/base44shim.ts';

// Workspace isolation diagnostic.
//
// This endpoint is deliberately inert. The suite it used to run created probe
// workspaces and records on every call, read every tenant's ground truth with
// service role, and returned another workspace's name and record count to the
// caller. It also could not produce a valid verdict from an admin account,
// because admin access bypasses the very workspace rules it was testing.
//
// It now answers only a signed-in platform administrator, and answers without
// touching a single record. The real check must run as a non-admin account in
// an isolated environment, never against production.
export default async function (req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth
    .me()
    .catch((error) => (error.status === 401 ? null : Promise.reject(error)));

  if (!user) {
    return Response.json({ error: 'Please sign in to run the isolation check.' }, { status: 401 });
  }

  if (user.role !== 'admin') {
    return Response.json(
      { error: 'This diagnostic is restricted to platform administrators.' },
      { status: 403 }
    );
  }

  return Response.json({
    verdict: 'INCONCLUSIVE',
    note: 'The isolation suite is disabled in production. It writes probe records and can only give a valid verdict when run as a non-admin account in an isolated environment.',
    checks: [],
  });
}