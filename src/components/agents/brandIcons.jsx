import { useEffect, useState } from 'react';
import {
  Bot, Briefcase, Calculator, CalendarClock, ClipboardList, Code, Contact, Factory, FileText, Globe, GraduationCap,
  Handshake, Headset, Hotel, House, Landmark, LineChart, Lock, Mail, Megaphone, MessagesSquare, Package, Plane,
  Scale, Search, Server, ShieldCheck, ShoppingCart, Sparkles, Stethoscope, TrendingUp, Truck, Umbrella, UserSearch,
  Utensils, Wrench,
} from 'lucide-react';
import { supabase } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

// The approved agent icon library (Lucide). The server keeps the same keys in
// supabase/functions/_shared/agentIcons.ts; a unit test checks they match.
export const APPROVED_ICONS = [
  { key: 'bot', label: 'General assistant', Icon: Bot },
  { key: 'briefcase', label: 'Recruitment / HR', Icon: Briefcase },
  { key: 'user-search', label: 'Candidate screening', Icon: UserSearch },
  { key: 'shield-check', label: 'Security', Icon: ShieldCheck },
  { key: 'lock', label: 'Privacy / access', Icon: Lock },
  { key: 'scale', label: 'Legal', Icon: Scale },
  { key: 'file-text', label: 'Documents', Icon: FileText },
  { key: 'megaphone', label: 'Marketing', Icon: Megaphone },
  { key: 'trending-up', label: 'Sales / growth', Icon: TrendingUp },
  { key: 'headset', label: 'Customer support', Icon: Headset },
  { key: 'messages', label: 'Chat / replies', Icon: MessagesSquare },
  { key: 'contact', label: 'CRM / clients', Icon: Contact },
  { key: 'house', label: 'Real estate', Icon: House },
  { key: 'umbrella', label: 'Insurance', Icon: Umbrella },
  { key: 'truck', label: 'Logistics', Icon: Truck },
  { key: 'package', label: 'Inventory / orders', Icon: Package },
  { key: 'stethoscope', label: 'Healthcare / dental', Icon: Stethoscope },
  { key: 'calendar-clock', label: 'Scheduling', Icon: CalendarClock },
  { key: 'plane', label: 'Flights / travel', Icon: Plane },
  { key: 'hotel', label: 'Hospitality', Icon: Hotel },
  { key: 'search', label: 'Research', Icon: Search },
  { key: 'line-chart', label: 'Analytics', Icon: LineChart },
  { key: 'landmark', label: 'Banking / finance', Icon: Landmark },
  { key: 'calculator', label: 'Bookkeeping / accounting', Icon: Calculator },
  { key: 'cart', label: 'E-commerce / retail', Icon: ShoppingCart },
  { key: 'graduation-cap', label: 'Education', Icon: GraduationCap },
  { key: 'utensils', label: 'Restaurants / food', Icon: Utensils },
  { key: 'factory', label: 'Manufacturing', Icon: Factory },
  { key: 'code', label: 'Software / IT', Icon: Code },
  { key: 'server', label: 'Infrastructure', Icon: Server },
  { key: 'mail', label: 'Email outreach', Icon: Mail },
  { key: 'handshake', label: 'Partnerships / negotiation', Icon: Handshake },
  { key: 'clipboard-list', label: 'Operations / tasks', Icon: ClipboardList },
  { key: 'wrench', label: 'Maintenance', Icon: Wrench },
  { key: 'globe', label: 'International / translation', Icon: Globe },
  { key: 'sparkles', label: 'Creative content', Icon: Sparkles },
];
const BY_KEY = Object.fromEntries(APPROVED_ICONS.map((i) => [i.key, i]));
export const iconLabel = (key) => BY_KEY[key]?.label || key;

export const iconUrl = (path, version) =>
  `${String(appParams.supabaseUrl || '').replace(/\/$/, '')}/storage/v1/object/public/agent-icons/${path}?v=${version || 0}`;

// One standard agent icon: 32 × 32 px, brand gradient tile, 18 px Lucide glyph at
// stroke 2; uploaded images are fitted inside the same box with their proportions kept.
// `icon` = { kind: 'library', key } | { kind: 'upload', path, version } | { kind: 'preview', src }.
export function BrandIcon({ icon, className = '', title }) {
  const box = `inline-grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg ${className}`;
  if (!icon) return null;
  if (icon.kind === 'library') {
    const Icon = BY_KEY[icon.key]?.Icon || Bot;
    return (
      <span className={`${box} bg-gradient-to-br from-blue-600 to-cyan-400 text-white`} title={title}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
      </span>
    );
  }
  const src = icon.kind === 'preview' ? icon.src : iconUrl(icon.path, icon.version);
  return (
    <span className={`${box} border border-white/10 bg-white/[0.04]`} title={title}>
      <img src={src} alt="" className="h-7 w-7 object-contain" draggable="false" />
    </span>
  );
}

// The glyph alone (for the existing featured-agent tiles, which keep their size).
export function BrandGlyph({ icon, className = 'h-5 w-5 text-white' }) {
  if (icon?.kind === 'library') {
    const Icon = BY_KEY[icon.key]?.Icon || Bot;
    return <Icon className={className} strokeWidth={2} aria-hidden="true" />;
  }
  if (icon?.kind === 'upload') return <img src={iconUrl(icon.path, icon.version)} alt="" className="h-8 w-8 object-contain" draggable="false" />;
  return null;
}

// Admin-approved names and icons, read once per page load (refreshed after an admin
// save). Browsers can only read these settings; changes go through the admin function.
let cache = null;
const listeners = new Set();
async function load() {
  const { data, error } = await supabase
    .from('agent_branding')
    .select('subject, agent_id, name, icon_kind, icon_key, icon_path, icon_version');
  if (error) return {};
  return Object.fromEntries((data || []).map((r) => [r.subject, r]));
}
export function refreshAgentBranding() {
  cache = load();
  cache.then((v) => listeners.forEach((fn) => fn(v)));
  return cache;
}

const toIcon = (row) =>
  row?.icon_kind === 'library' ? { kind: 'library', key: row.icon_key }
    : row?.icon_kind === 'upload' ? { kind: 'upload', path: row.icon_path, version: row.icon_version }
      : null;

export function useAgentBranding() {
  const [rows, setRows] = useState({});
  useEffect(() => {
    let alive = true;
    if (!cache) cache = load();
    cache.then((v) => alive && setRows(v));
    const fn = (v) => alive && setRows(v);
    listeners.add(fn);
    return () => {
      alive = false;
      listeners.delete(fn);
    };
  }, []);
  return {
    iconFor: (agentId) => toIcon(rows[agentId]),
    featured: (key) => ({ name: rows[`featured:${key}`]?.name || null, icon: toIcon(rows[`featured:${key}`]) }),
  };
}
