export const industries = [
  { value: 'E-commerce & Retail', label: 'E-commerce & Retail', hint: 'Orders, returns, product help', icon: 'cart' },
  { value: 'SaaS & Technology', label: 'SaaS & Technology', hint: 'Onboarding, support, docs', icon: 'cloud' },
  { value: 'Agency & Consulting', label: 'Agency & Consulting', hint: 'Leads, proposals, delivery', icon: 'layers' },
  { value: 'Healthcare & Clinics', label: 'Healthcare & Clinics', hint: 'Appointments, triage, follow-up', icon: 'heart' },
  { value: 'Finance & Insurance', label: 'Finance & Insurance', hint: 'Claims, KYC, customer care', icon: 'chart' },
  { value: 'Real Estate', label: 'Real Estate', hint: 'Listings, viewings, buyers', icon: 'home' },
  { value: 'Education & Training', label: 'Education & Training', hint: 'Enrolment, tutoring, support', icon: 'book' },
  { value: 'Hospitality & Travel', label: 'Hospitality & Travel', hint: 'Bookings, guests, itineraries', icon: 'compass' },
  { value: 'Logistics & Manufacturing', label: 'Logistics & Manufacturing', hint: 'Shipments, inventory, suppliers', icon: 'truck' },
  { value: 'Legal & Professional', label: 'Legal & Professional', hint: 'Intake, documents, scheduling', icon: 'scale' },
  { value: 'Fitness & Wellness', label: 'Fitness & Wellness', hint: 'Memberships, classes, retention', icon: 'sparkles' },
  { value: 'Other', label: 'Something else', hint: 'Your own industry', icon: 'bot' },
];

export const responsibilityOptions = [
  'Answer customer questions',
  'Qualify and route leads',
  'Draft replies and follow-ups',
  'Book and reschedule appointments',
  'Summarise documents and calls',
  'Triage and tag support tickets',
  'Write product and marketing copy',
  'Monitor inboxes and alerts',
  'Prepare reports and summaries',
  'Chase invoices and payments',
  'Onboard new customers',
  'Research accounts and prospects',
];

export const permissionOptions = [
  { value: 'Read the shared knowledge base', label: 'Read the shared knowledge base', hint: 'Documents and policies you provide' },
  { value: 'Search the web', label: 'Search the web', hint: 'Look up public information' },
  { value: 'Read customer records', label: 'Read customer records', hint: 'Names, history, orders' },
  { value: 'Create and update records', label: 'Create and update records', hint: 'Write notes, tasks and deals' },
  { value: 'Send emails on my behalf', label: 'Send emails on my behalf', hint: 'Needs approval on first send' },
  { value: 'Send chat messages', label: 'Send chat messages', hint: 'Slack, WhatsApp or live chat' },
  { value: 'Book or change calendar events', label: 'Book or change calendar events', hint: 'Create and move meetings' },
  { value: 'Take payments or refunds', label: 'Take payments or refunds', hint: 'Sensitive, always human-approved' },
  { value: 'Delete records', label: 'Delete records', hint: 'Sensitive, always human-approved' },
];

export const toneOptions = [
  { value: 'Professional & concise', label: 'Professional & concise', hint: 'Short, clear, no fluff' },
  { value: 'Warm & friendly', label: 'Warm & friendly', hint: 'Human, approachable' },
  { value: 'Consultative expert', label: 'Consultative expert', hint: 'Advises, explains the why' },
  { value: 'Playful & energetic', label: 'Playful & energetic', hint: 'Light, upbeat, still clear' },
  { value: 'Formal & precise', label: 'Formal & precise', hint: 'Regulated, legal, clinical' },
];

export const toolOptions = [
  'Gmail',
  'Google Calendar',
  'Slack',
  'HubSpot',
  'Stripe',
  'Shopify',
  'Notion',
  'Google Sheets',
  'Zendesk',
  'Airtable',
  'Web search',
  'Custom API',
];

export const wizardSteps = [
  { key: 'industry', label: 'Industry' },
  { key: 'business', label: 'Business' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'responsibilities', label: 'Scope' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'tone', label: 'Voice' },
  { key: 'tools', label: 'Tools' },
  { key: 'review', label: 'Build' },
];