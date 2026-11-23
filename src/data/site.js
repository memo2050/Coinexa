export const navLinks = [
  { label: 'Home Page', to: '/' },
  { label: 'AI Agents', to: '/agents' },
  { label: 'Portfolio', to: '/#portfolio' },
  { label: 'Process', to: '/#process' },
  { label: 'Pricing', to: '/#pricing' },
  { label: 'Contact us', to: '/#contact' },
];

export const pricingTiers = [
  {
    name: 'Agent Sprint',
    key: 'agent_sprint',
    price: '$25',
    cadence: 'per month · rolling',
    tagline: 'One production-ready AI agent, live inside your existing workflow.',
    features: [
      'One agent built end to end',
      'Up to three tool integrations',
      'Evaluation suite and guardrails',
      'Documentation and handover',
    ],
    cta: 'Start a sprint',
    highlight: false,
  },
  {
    name: 'Studio Retainer',
    key: 'studio_retainer',
    price: '$50',
    cadence: 'per month · rolling',
    tagline: 'A senior AI team building and improving agents with you every month.',
    features: [
      'Two to three new agents a quarter',
      'Monitoring, evaluation and tuning',
      'Unlimited changes to live agents',
      'Shared Slack channel with the team',
    ],
    cta: 'Book a call',
    highlight: true,
  },
  {
    name: 'Platform Partner',
    key: null,
    price: 'Custom',
    cadence: 'annual engagement',
    tagline: 'Private deployments with security review, audit trails and an SLA.',
    features: [
      'Private or on-premise deployment',
      'SSO, audit logs and role-based access',
      '99.9% uptime response SLA',
      'Named architect on your account',
    ],
    cta: 'Talk to us',
    highlight: false,
  },
];

export const hero = {
  badge: 'Booking new engagements for Q1',
  headlineStart: 'We Build Intelligent AI agents',
  headlineHighlight: 'for the future',
  headlineEnd: 'of AI',
  paragraph:
    'Coinexa.net is an AI agentic automation platform. We deploy autonomous agents that understand your business, execute multi-step workflows and deliver measurable results — with human approval exactly where it matters.',
  chips: [
    { label: 'Inference latency', value: '42ms', icon: 'zap', position: 'left' },
    { label: 'SOC 2 aligned', value: 'Audited', icon: 'shield', position: 'right' },
    { label: 'Team efficiency', value: '+38%', icon: 'trend', position: 'bottom' },
  ],
};

export const metrics = [
  { value: '140+', label: 'Projects delivered' },
  { value: '48', label: 'Enterprise clients' },
  { value: '98%', label: 'Client retention' },
];

export const clients = [
  { name: 'Ledgerly', shape: 'diamond' },
  { name: 'Medivance', shape: 'circle' },
  { name: 'Routeline', shape: 'triangle' },
  { name: 'ShopHarbor', shape: 'square' },
  { name: 'Gridpoint', shape: 'star' },
  { name: 'Vaultis', shape: 'hexagon' },
];

export const featuredServices = [
  {
    icon: 'bot',
    tint: 'from-fuchsia-500/25 to-indigo-500/10',
    accent: 'text-fuchsia-300',
    title: 'AI & Machine Learning',
    text:
      'Custom models, forecasting, computer vision and recommendation engines trained on your own data, then deployed with monitoring that catches drift before your users do.',
  },
  {
    icon: 'messages',
    tint: 'from-violet-500/25 to-sky-500/10',
    accent: 'text-violet-300',
    title: 'Generative AI & LLMs',
    text:
      'Private assistants, document intelligence and workflow agents built on retrieval-augmented pipelines, with evaluation harnesses and guardrails from day one.',
  },
  {
    icon: 'cloud',
    tint: 'from-sky-500/25 to-cyan-500/10',
    accent: 'text-sky-300',
    title: 'Cloud & DevOps',
    text:
      'Migrations, Kubernetes platforms, infrastructure as code and delivery pipelines that make shipping predictable instead of dramatic.',
  },
];

export const services = [
  {
    icon: 'code',
    accent: 'text-emerald-300',
    title: 'Custom Software',
    text:
      'Web platforms, mobile apps and APIs engineered for scale, with clear architecture and test coverage that keeps velocity honest.',
    tags: ['React', 'Node', 'Python', 'Flutter'],
  },
  {
    icon: 'shield',
    accent: 'text-amber-300',
    title: 'Cybersecurity',
    text:
      'Audits, penetration testing, zero-trust identity design and compliance readiness for SOC 2, ISO 27001 and GDPR.',
    tags: ['Pen testing', 'IAM', 'Compliance'],
  },
  {
    icon: 'chart',
    accent: 'text-cyan-300',
    title: 'Data Engineering',
    text:
      'Reliable pipelines, warehouses and dashboards that turn scattered events into decisions your team actually trusts.',
    tags: ['Snowflake', 'dbt', 'Spark'],
  },
  {
    icon: 'pen',
    accent: 'text-pink-300',
    title: 'Product Design',
    text:
      'Research, interface design and prototypes that de-risk the build before a line of production code is written.',
    tags: ['Research', 'UX', 'Design systems'],
  },
  {
    icon: 'server',
    accent: 'text-indigo-300',
    title: 'Platform Engineering',
    text:
      'Internal platforms, developer tooling and golden paths that let product teams ship without waiting on infrastructure.',
    tags: ['Kubernetes', 'Terraform', 'GitOps'],
  },
  {
    icon: 'layers',
    accent: 'text-teal-300',
    title: 'Analytics & BI',
    text:
      'Warehouse modelling, semantic layers and executive reporting so every team argues from the same numbers.',
    tags: ['Modelling', 'Warehouse', 'Dashboards'],
  },
];

export const projects = [
  {
    category: 'AI',
    tag: 'AI · Fintech',
    title: 'Loan document intelligence',
    text:
      'An extraction and validation pipeline that reads, classifies and reconciles commercial loan files for a regional lender.',
    icon: 'file',
    gradient: 'from-blue-600 via-indigo-600 to-cyan-500',
    metrics: [
      { value: '94%', label: 'Extraction accuracy' },
      { value: '6 wks', label: 'To production' },
    ],
  },
  {
    category: 'Cloud',
    tag: 'Cloud · Logistics',
    title: 'Zero-downtime platform migration',
    text:
      'Re-platformed a monolith onto Kubernetes with automated blue-green releases and peak-season autoscaling.',
    icon: 'cloud',
    gradient: 'from-sky-500 via-cyan-500 to-teal-400',
    metrics: [
      { value: '0 min', label: 'Downtime' },
      { value: '-41%', label: 'Infra spend' },
    ],
  },
  {
    category: 'Software',
    tag: 'Software · Healthcare',
    title: 'Patient companion app',
    text:
      'A cross-platform app for appointment booking, secure messaging and remote vitals tracking across 40 clinics.',
    icon: 'tablet',
    gradient: 'from-fuchsia-500 via-purple-500 to-indigo-500',
    metrics: [
      { value: '4.8★', label: 'Store rating' },
      { value: '120k', label: 'Monthly users' },
    ],
  },
  {
    category: 'AI',
    tag: 'AI · Retail',
    title: 'Demand forecasting engine',
    text:
      'SKU-level time-series models across 300 stores, feeding replenishment decisions every morning.',
    icon: 'cart',
    gradient: 'from-orange-500 via-amber-500 to-rose-500',
    metrics: [
      { value: '+18%', label: 'Forecast accuracy' },
      { value: '$2.3M', label: 'Annual savings' },
    ],
  },
  {
    category: 'Security',
    tag: 'Security · Banking',
    title: 'Zero-trust rollout',
    text:
      'Redesigned identity and network access for 2,000 staff and reached SOC 2 Type II in nine months.',
    icon: 'shield',
    gradient: 'from-cyan-400 via-blue-500 to-indigo-600',
    metrics: [
      { value: '0', label: 'Critical findings' },
      { value: '9 mo', label: 'To certification' },
    ],
  },
  {
    category: 'Software',
    tag: 'Software · SaaS',
    title: 'Multi-tenant analytics suite',
    text:
      'A real-time product analytics application handling billions of events a month with sub-second queries.',
    icon: 'chart',
    gradient: 'from-teal-400 via-emerald-500 to-cyan-500',
    metrics: [
      { value: '3B+', label: 'Events / month' },
      { value: '<1s', label: 'Query time' },
    ],
  },
];

export const filters = ['All', 'AI', 'Cloud', 'Software', 'Security'];

export const steps = [
  {
    number: '01',
    title: 'Discover',
    text: 'We map your goals, data and constraints, then agree on success metrics and a roadmap you can defend internally.',
  },
  {
    number: '02',
    title: 'Design',
    text: 'Architecture, interface and model strategy are validated with rapid prototypes before heavy investment.',
  },
  {
    number: '03',
    title: 'Deliver',
    text: 'Two-week sprints with demos, automated tests and secure deployment pipelines from the first release.',
  },
  {
    number: '04',
    title: 'Evolve',
    text: 'Monitoring, retraining and support keep your systems accurate, fast and improving after launch.',
  },
];

export const aboutBullets = [
  'Senior-only teams with hands-on delivery experience',
  'Responsible AI practice: privacy, fairness and explainability',
  'Fixed-scope or flexible engagement models',
  'Documentation and knowledge transfer in every engagement',
];

export const aboutStats = [
  { value: '9+', label: 'Years of experience' },
  { value: '35', label: 'Specialist engineers' },
  { value: '12', label: 'Countries served' },
  { value: '24/7', label: 'Support coverage' },
];

export const testimonials = [
  {
    quote:
      'Coinexa.net shipped our document AI in under four months. Accuracy beat the targets we set ourselves, and the handover was spotless.',
    initials: 'SR',
    name: 'Sarah Reyes',
    role: 'CTO, Ledgerly',
  },
  {
    quote:
      'Our migration finished with no downtime and a noticeably lower bill. They explain trade-offs honestly, which is rarer than it should be.',
    initials: 'MK',
    name: 'Marcus Keller',
    role: 'VP Engineering, Routeline',
  },
  {
    quote:
      'They treated security as a product requirement instead of a checkbox. We passed our audit on the first attempt.',
    initials: 'AL',
    name: 'Amira Lindqvist',
    role: 'CISO, Vaultis',
  },
];

export const serviceOptions = [
  'AI & machine learning',
  'Generative AI & LLMs',
  'Cloud & DevOps',
  'Custom software',
  'Cybersecurity',
  'Data engineering',
  'Something else',
];