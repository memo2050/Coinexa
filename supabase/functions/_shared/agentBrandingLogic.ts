// Shared rules for agent names and the built-in featured agents (no I/O: unit-tested).
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

export const FEATURED: Record<string, { name: string; icon: string; text: string; plan: string; description: string }> = {
  'featured:recruitment': { name: 'AI Recruitment & Talent Sourcing Agent', icon: 'briefcase', plan: 'recruitment',
    description: 'Find, evaluate, contact and negotiate with IT professionals worldwide — inside the budget you approve, with candidate consent and a full audit trail.',
    text: 'Find, evaluate, contact and negotiate with IT professionals worldwide; recruitment and talent sourcing.' },
  'featured:cyber-scan': { name: 'Cyber Security Scan Agent', icon: 'shield-check', plan: 'cyber-scan',
    description: 'Scan your own local network from a linked Windows PC, find devices and open ports, and get a prioritised security report — authorised scans only.',
    text: 'Scan your own local network from a linked Windows PC, find devices and open ports, security report.' },
};

// Names: 2–80 characters of ordinary text, spaces collapsed, no markup characters.
export function cleanName(v: unknown): string {
  const name = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) throw fail('The name must be 2 to 80 characters.');
  if (/[<>{}\u0000-\u001f\u007f]/.test(name)) throw fail('The name contains characters that are not allowed (< > { } or control characters).');
  return name;
}


export const STATUSES = ['draft', 'active', 'paused'];

// Description: up to 600 characters of plain text (line breaks kept, no markup).
export function cleanDescription(v: unknown): string {
  const text = String(v ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > 600) throw fail('The description must be 600 characters or fewer.');
  if (/[<>{}\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) throw fail('The description contains characters that are not allowed (< > { } or control characters).');
  return text;
}

// Category: a short label such as "Customer Support Agent" (2–60 characters).
export function cleanCategory(v: unknown): string {
  const name = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 60) throw fail('The category must be 2 to 60 characters.');
  if (/[<>{}\u0000-\u001f\u007f]/.test(name)) throw fail('The category contains characters that are not allowed.');
  return name;
}
