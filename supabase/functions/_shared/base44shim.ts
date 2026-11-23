// Server-side stand-in for `npm:@base44/sdk` so the 22 original function files run
// on Supabase with only their import lines changed.
//
//   base44.auth.me()            → the caller, from the request's Supabase JWT + profile
//   base44.entities.X           → caller-scoped (row level security applies)
//   base44.asServiceRole.*      → service role (bypasses RLS; functions do their own checks)
//   integrations.Core.*         → Anthropic, Resend and Supabase Storage
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
import { makeEntities } from './entityQuery.js';
import { makeInvokeLLM } from './ai.ts';
import { SendEmail } from './email.ts';
import { requestContext } from './context.ts';

const URL_ = () => Deno.env.get('SUPABASE_URL')!;
const ANON = () => Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'private';

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let serviceClient: SupabaseClient | null = null;
export const service = () => (serviceClient ||= createClient(URL_(), SERVICE(), options));

const bearer = (req: Request) => {
  const header = req.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  // The anon/publishable key is not a user session.
  if (!token || token === ANON()) return '';
  return token;
};

// file_uri format: "<bucket>/<path>"
const splitUri = (uri: string) => {
  const clean = String(uri || '').replace(/^storage:\/\//, '');
  const slash = clean.indexOf('/');
  if (slash < 1) throw Object.assign(new Error('Invalid file reference.'), { status: 400 });
  return { bucket: clean.slice(0, slash), path: clean.slice(slash + 1) };
};

function makeCore() {
  const svc = service();
  return {
    InvokeLLM: makeInvokeLLM(svc),
    SendEmail,
    async UploadPrivateFile({ file }: { file: File }) {
      const safe = String(file?.name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
      const path = `server/${crypto.randomUUID()}-${safe}`;
      const { error } = await svc.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw Object.assign(new Error(`The file could not be stored: ${error.message}`), { status: 502 });
      return { file_uri: `${BUCKET}/${path}` };
    },
    async CreateFileSignedUrl({ file_uri, expires_in = 900 }: { file_uri: string; expires_in?: number }) {
      const { bucket, path } = splitUri(file_uri);
      if (bucket !== BUCKET) throw Object.assign(new Error('Unknown storage bucket.'), { status: 400 });
      const { data, error } = await svc.storage.from(bucket).createSignedUrl(path, Math.min(Number(expires_in) || 900, 3600));
      if (error) throw Object.assign(new Error(`Could not sign the file: ${error.message}`), { status: 502 });
      return { signed_url: data.signedUrl };
    },
  };
}

export function createClientFromRequest(req: Request) {
  const token = bearer(req);
  const userClient = createClient(URL_(), ANON(), {
    ...options,
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  const core = makeCore();
  let me: Record<string, unknown> | null = null;

  const auth = {
    async me() {
      if (me) return me;
      if (!token) throw Object.assign(new Error('Not signed in'), { status: 401 });
      const { data, error } = await service().auth.getUser(token);
      if (error || !data?.user) throw Object.assign(new Error('Not signed in'), { status: 401 });
      const user = data.user;
      let { data: profile } = await service().from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (!profile) {
        // Trigger race on first sign-in: create the profile the trigger would have made.
        const created = await service()
          .from('profiles')
          .upsert({ id: user.id, email: user.email, full_name: user.user_metadata?.full_name || user.user_metadata?.name || '', role: 'user' }, { onConflict: 'id' })
          .select('*')
          .single();
        profile = created.data;
      }
      me = {
        ...profile,
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || user.user_metadata?.full_name || '',
        role: profile?.role === 'admin' ? 'admin' : 'user',
        organization_ids: profile?.organization_ids || [],
      };
      const ctx = requestContext.getStore();
      if (ctx) ctx.userId = user.id;
      return me;
    },
  };

  return {
    auth,
    entities: makeEntities(userClient),
    integrations: { Core: core },
    asServiceRole: {
      entities: makeEntities(service()),
      integrations: { Core: core },
      // The Gmail connector is never used by any function (shared/emailPolicy.ts).
      connectors: { getConnection: async () => null },
    },
  };
}

export const createClient_ = createClientFromRequest;
