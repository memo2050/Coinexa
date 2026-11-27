// The approved agent icon library (server side). Every key maps to one Lucide icon in
// src/components/agents/brandIcons.jsx; a unit test checks the two lists match exactly.
// Suggestions (AI or rules) can only ever return one of these keys.
export const ICONS: { key: string; label: string; words: string[] }[] = [
  { key: 'bot', label: 'General assistant', words: ['assistant', 'general', 'custom', 'ai agent', 'automation'] },
  { key: 'briefcase', label: 'Recruitment / HR', words: ['recruit', 'hiring', 'talent', 'hr', 'human resources', 'job', 'career', 'staffing'] },
  { key: 'user-search', label: 'Candidate screening', words: ['resume', 'cv', 'screening', 'candidate', 'sourcing', 'applicant'] },
  { key: 'shield-check', label: 'Security', words: ['security', 'cyber', 'network scan', 'vulnerability', 'threat', 'firewall', 'scan'] },
  { key: 'lock', label: 'Privacy / access', words: ['privacy', 'access control', 'password', 'identity', 'gdpr'] },
  { key: 'scale', label: 'Legal', words: ['legal', 'law', 'contract', 'attorney', 'lawyer', 'compliance', 'nda'] },
  { key: 'file-text', label: 'Documents', words: ['document', 'paperwork', 'form', 'writing', 'report', 'proposal'] },
  { key: 'megaphone', label: 'Marketing', words: ['marketing', 'campaign', 'advertising', 'social media', 'brand', 'seo'] },
  { key: 'trending-up', label: 'Sales / growth', words: ['sales', 'growth', 'lead', 'revenue', 'pipeline', 'prospect'] },
  { key: 'headset', label: 'Customer support', words: ['support', 'customer service', 'helpdesk', 'help desk', 'ticket', 'call center'] },
  { key: 'messages', label: 'Chat / replies', words: ['chat', 'conversation', 'reply', 'replies', 'messaging', 'whatsapp'] },
  { key: 'contact', label: 'CRM / clients', words: ['crm', 'contact', 'client', 'relationship', 'account management'] },
  { key: 'house', label: 'Real estate', words: ['real estate', 'property', 'rental', 'realtor', 'listing', 'mortgage', 'tenant'] },
  { key: 'umbrella', label: 'Insurance', words: ['insurance', 'policy', 'claim', 'coverage', 'underwriting', 'premium'] },
  { key: 'truck', label: 'Logistics', words: ['logistics', 'shipping', 'delivery', 'freight', 'fleet', 'transport', 'supply chain'] },
  { key: 'package', label: 'Inventory / orders', words: ['inventory', 'warehouse', 'order', 'fulfillment', 'stock'] },
  { key: 'stethoscope', label: 'Healthcare / dental', words: ['health', 'medical', 'clinic', 'dental', 'dentist', 'patient', 'doctor', 'hospital'] },
  { key: 'calendar-clock', label: 'Scheduling', words: ['schedule', 'scheduling', 'appointment', 'booking', 'reservation', 'calendar'] },
  { key: 'plane', label: 'Flights / travel', words: ['flight', 'travel', 'airline', 'trip', 'airport', 'itinerary'] },
  { key: 'hotel', label: 'Hospitality', words: ['hotel', 'hospitality', 'accommodation', 'resort'] },
  { key: 'search', label: 'Research', words: ['research', 'product research', 'investigation', 'discovery', 'market research'] },
  { key: 'line-chart', label: 'Analytics', words: ['analytics', 'data analysis', 'metrics', 'forecast', 'dashboard', 'kpi'] },
  { key: 'landmark', label: 'Banking / finance', words: ['bank', 'finance', 'financial', 'investment', 'loan', 'government'] },
  { key: 'calculator', label: 'Bookkeeping / accounting', words: ['bookkeeping', 'accounting', 'invoice', 'tax', 'payroll', 'expense'] },
  { key: 'cart', label: 'E-commerce / retail', words: ['ecommerce', 'e-commerce', 'retail', 'shop', 'store', 'product catalog'] },
  { key: 'graduation-cap', label: 'Education', words: ['education', 'training', 'school', 'course', 'student', 'tutor'] },
  { key: 'utensils', label: 'Restaurants / food', words: ['restaurant', 'food', 'catering', 'menu', 'kitchen'] },
  { key: 'factory', label: 'Manufacturing', words: ['manufacturing', 'production', 'factory', 'industrial', 'plant'] },
  { key: 'code', label: 'Software / IT', words: ['software', 'developer', 'engineering', 'code', 'it support', 'programming'] },
  { key: 'server', label: 'Infrastructure', words: ['infrastructure', 'devops', 'hosting', 'server', 'cloud'] },
  { key: 'mail', label: 'Email outreach', words: ['email', 'newsletter', 'outreach', 'inbox'] },
  { key: 'handshake', label: 'Partnerships / negotiation', words: ['negotiation', 'partnership', 'deal', 'procurement', 'vendor'] },
  { key: 'clipboard-list', label: 'Operations / tasks', words: ['operations', 'task', 'checklist', 'project management', 'workflow'] },
  { key: 'wrench', label: 'Maintenance', words: ['maintenance', 'repair', 'field service', 'technician'] },
  { key: 'globe', label: 'International / translation', words: ['international', 'translation', 'translate', 'global', 'language'] },
  { key: 'sparkles', label: 'Creative content', words: ['creative', 'content', 'copywriting', 'design', 'generator'] },
];

export const ICON_KEYS = new Set(ICONS.map((i) => i.key));

// Built-in agents: the catalog plan decides the suggestion before any keyword.
export const PLAN_ICON: Record<string, string> = {
  recruitment: 'briefcase', 'cyber-scan': 'shield-check', 'marketing-sales': 'megaphone', legal: 'scale',
  crm: 'contact', 'real-estate': 'house', insurance: 'umbrella', logistics: 'truck', dentisched: 'stethoscope',
  hazel: 'search', custom: 'bot', 'customer-support': 'headset', 'resume-screening': 'user-search',
  fadel: 'calculator', 'flight-booking': 'plane',
};

// Deterministic keyword suggestion: same text → same icon, always from the library.
export function suggestByRules(text: string, planKey?: string | null): { icon: string; reason: string } {
  if (planKey && PLAN_ICON[planKey]) return { icon: PLAN_ICON[planKey], reason: `Matches the ${planKey} agent type.` };
  const t = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9&+-]+/g, ' ')} `;
  let best = { icon: 'bot', score: 0, word: '' };
  for (const icon of ICONS) {
    let score = 0;
    let word = '';
    for (const w of icon.words) {
      if (t.includes(` ${w}`)) { score += w.length > 6 ? 2 : 1; word ||= w; }
    }
    if (score > best.score) best = { icon: icon.key, score, word };
  }
  return best.score
    ? { icon: best.icon, reason: `The agent's description mentions "${best.word}".` }
    : { icon: 'bot', reason: 'No specific role or industry found; general assistant icon.' };
}
