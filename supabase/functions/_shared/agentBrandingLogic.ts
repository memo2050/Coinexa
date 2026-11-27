// Shared rules for agent names and the built-in featured agents (no I/O: unit-tested).
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

export const FEATURED: Record<string, { name: string; icon: string; text: string; plan: string }> = {
  'featured:recruitment': { name: 'AI Recruitment & Talent Sourcing Agent', icon: 'briefcase', plan: 'recruitment',
    text: 'Find, evaluate, contact and negotiate with IT professionals worldwide; recruitment and talent sourcing.' },
  'featured:cyber-scan': { name: 'Cyber Security Scan Agent', icon: 'shield-check', plan: 'cyber-scan',
    text: 'Scan your own local network from a linked Windows PC, find devices and open ports, security report.' },
};

// Names: 2–80 characters of ordinary text, spaces collapsed, no markup characters.
export function cleanName(v: unknown): string {
  const name = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) throw fail('The name must be 2 to 80 characters.');
  if (/[<>{}\u0000-\u001f\u007f]/.test(name)) throw fail('The name contains characters that are not allowed (< > { } or control characters).');
  return name;
}

