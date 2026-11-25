// Coinexa client. Presents the same `base44` object the pages already use
// (entities, functions, auth, integrations, app) on top of Supabase, so no page
// or component had to change.
import { createClient } from '@supabase/supabase-js';
import { makeEntities, tableFor } from '@/api/entityQuery';
import { appParams } from '@/lib/app-params';

const { supabaseUrl, supabaseAnonKey } = appParams;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

const BUCKET = 'private';

const withStatus = (message, status, data) => Object.assign(new Error(message), { status, response: { status, data } });

async function session() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

// ---------------------------------------------------------------------------
// entities.X.* — row level security decides what each user can see and change
// ---------------------------------------------------------------------------
const baseEntities = makeEntities(supabase);

function subscribe(entityName, callback) {
  const table = tableFor(entityName);
  const channel = supabase
    .channel(`${table}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      const type = payload.eventType === 'INSERT' ? 'create' : payload.eventType === 'DELETE' ? 'delete' : 'update';
      const data = type === 'delete' ? payload.old : payload.new;
      callback({ type, id: data?.id, data });
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

const entities = new Proxy(
  {},
  {
    get(_, name) {
      if (typeof name !== 'string' || name === 'then') return undefined;
      const entity = baseEntities[name];
      return { ...entity, subscribe: (callback) => subscribe(name, callback) };
    },
  }
);

// ---------------------------------------------------------------------------
// functions.invoke(name, body) → { data }, throws with err.response.data like axios
// ---------------------------------------------------------------------------
async function invoke(name, body = {}) {
  const current = await session();
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${current?.access_token || supabaseAnonKey}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!response.ok) throw withStatus(data?.error || `Request failed (${response.status})`, response.status, data);
  return { data, status: response.status };
}

// ---------------------------------------------------------------------------
// auth.* — Supabase Auth with the same method names the pages call
// ---------------------------------------------------------------------------
const absolute = (path) => new URL(path || '/', window.location.origin).href;

const auth = {
  async me() {
    const current = await session();
    if (!current?.user) throw withStatus('Not signed in', 401);
    const user = current.user;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    return {
      ...(profile || {}),
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
      role: profile?.role === 'admin' ? 'admin' : 'user',
    };
  },
  async isAuthenticated() {
    return Boolean(await session());
  },
  async loginViaEmailPassword(email, password, captchaToken) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined });
    if (error) throw withStatus(error.message === 'Email not confirmed' ? 'Please verify your email first.' : 'Invalid email or password', 401);
    return { access_token: data.session?.access_token, user: data.user };
  },
  async register({ email, password, captchaToken }) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: absolute('/agents'), ...(captchaToken ? { captchaToken } : {}) } });
    if (error) throw withStatus(error.message, 400);
    // Supabase reports an existing address as success with no identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw withStatus('An account with this email already exists. Sign in instead.', 409);
    }
    return data;
  },
  async verifyOtp({ email, otpCode }) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: String(otpCode || '').trim(), type: 'signup' });
    if (error) throw withStatus('Invalid or expired verification code', 400);
    return { access_token: data.session?.access_token, user: data.user };
  },
  async resendOtp(email, captchaToken) {
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: captchaToken ? { captchaToken } : undefined });
    if (error) throw withStatus(error.message, 429);
  },
  async loginWithProvider(provider, returnTo) {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: absolute(returnTo || '/agents') } });
    if (error) throw withStatus(error.message, 400);
  },
  async resetPasswordRequest(email, captchaToken) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: absolute('/reset-password'), ...(captchaToken ? { captchaToken } : {}) });
    if (error) throw withStatus(error.message, 429);
  },
  // The reset email links to /reset-password?token=<token hash>.
  async resetPassword({ resetToken, newPassword }) {
    if (resetToken) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: resetToken, type: 'recovery' });
      if (error) throw withStatus('This reset link is invalid or has expired. Request a new one.', 400);
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw withStatus(error.message, 400);
    await supabase.auth.signOut();
  },
  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (redirectUrl) window.location.href = redirectUrl;
  },
  redirectToLogin(returnTo) {
    const target = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login';
    window.location.href = target;
  },
  // Sessions are managed by supabase-js; kept so existing calls are harmless.
  setToken() {},
};

// ---------------------------------------------------------------------------
// integrations.Core.UploadPrivateFile — private bucket, own folder only
// ---------------------------------------------------------------------------
const integrations = {
  Core: {
    async UploadPrivateFile({ file }) {
      const current = await session();
      if (!current?.user) throw withStatus('Please sign in to upload files.', 401);
      const safe = String(file?.name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
      const path = `${current.user.id}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw withStatus(`The file could not be uploaded: ${error.message}`, 400);
      return { file_uri: `${BUCKET}/${path}` };
    },
  },
};

const app = {
  async getPublicSettings() {
    return { id: appParams.appId, public_settings: {} };
  },
};

export const base44 = { entities, functions: { invoke }, auth, integrations, app };


// Two-step sign-in (authenticator app, TOTP) on Supabase Auth.
export const mfa = {
  // { current: 'aal1'|'aal2', next: 'aal1'|'aal2' } — next aal2 with current aal1 = a code is needed.
  async level() {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return { current: data.currentLevel, next: data.nextLevel };
  },
  async factors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return (data?.totp || []).filter((f) => f.status === 'verified');
  },
  async enroll() {
    // Remove abandoned, unverified setups first so a fresh QR code can be issued.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all || []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    if (error) throw error;
    return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  },
  async verify(factorId, code) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: String(code || '').replace(/\s/g, '') });
    if (error) throw withStatus('That code is not valid. Use the current 6-digit code from your app.', 400);
  },
  async challenge(code) {
    const [factor] = await mfa.factors();
    if (!factor) throw withStatus('No authenticator is set up.', 400);
    await mfa.verify(factor.id, code);
  },
  async remove(factorId) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw withStatus('Two-step sign-in could not be turned off. Sign in again and retry.', 400);
  },
};
