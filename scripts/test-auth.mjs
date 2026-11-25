// Sign-in helpers for automated tests.
//
// With CAPTCHA on, password sign-in needs a solved Turnstile challenge, which a test
// cannot (and must not) fake. Tests therefore sign in with a one-time link issued by
// the server (admin API), which Supabase Auth does not put behind the CAPTCHA.
// Admin checks also need two-step sign-in: enrollTotp() sets up an authenticator
// factor and verifies a real TOTP code, raising the session to aal2.
import { createHmac } from 'node:crypto';

export async function signInWithLink(admin, client, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const { data: session, error: e2 } = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (e2) throw e2;
  return session.session;
}

function base32(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of text.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as authenticator apps compute it.
export function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const mac = createHmac('sha1', base32(secret)).update(counter).digest();
  const o = mac[mac.length - 1] & 0xf;
  const n = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(n % 1e6).padStart(6, '0');
}

// Enrolls an authenticator for the signed-in client and verifies a code (session → aal2).
export async function enrollTotp(client) {
  const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `test ${Date.now()}` });
  if (error) throw error;
  const { error: e2 } = await client.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(data.totp.secret) });
  if (e2) throw e2;
  const { data: s } = await client.auth.getSession();
  return { factorId: data.id, secret: data.totp.secret, token: s.session.access_token, session: s.session };
}
