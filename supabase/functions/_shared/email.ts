// Replacement for Base44's Core.SendEmail({ to, template_name, variables }).
// Sends through Resend's HTTP API (free tier). Only the two fixed templates
// exist; callers can never supply HTML or subjects (see shared/emailPolicy.ts).
//
// Staging: set EMAIL_REDIRECT_TO to the owner's own address. Every message is then
// delivered there instead (original recipient shown in the subject), which is
// required by Resend's test sender and keeps test mail away from real people.
import { TEMPLATES } from './emailTemplates.ts';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fill = (template: string, variables: Record<string, unknown>, escape: boolean) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => (escape ? escapeHtml(variables[key]) : String(variables[key] ?? '')));

export async function SendEmail(args: { to: string; template_name: string; variables?: Record<string, unknown> }) {
  const template = TEMPLATES[args.template_name];
  if (!template) throw new Error(`Unknown email template ${args.template_name}`);
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('Email is not configured.');

  const variables = args.variables || {};
  const redirect = Deno.env.get('EMAIL_REDIRECT_TO');
  const subjectText = fill(template.subject, variables, false).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const subject = redirect ? `[staging → ${args.to}] ${subjectText}` : subjectText;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') || 'Coinexa <onboarding@resend.dev>',
      to: [redirect || args.to],
      subject,
      html: fill(template.html, variables, true),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Email provider refused the message (${response.status}) ${detail.slice(0, 120)}`);
  }
  return { status: 'sent' };
}
