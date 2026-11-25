-- AI Recruitment & Talent Sourcing Agent.
--
-- Tenant isolation: every row carries organization_id. Browsers get NO direct
-- access to these tables (RLS on, no policies, no grants); everything goes through
-- the `recruitment` server function, which checks workspace membership and role on
-- every request. Candidate contact details are stored encrypted (AES-GCM, key held
-- only as a server secret) in contact_enc; companies see them only with consent.

create table public.recruitment_campaigns (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  title text not null,
  specialization text,
  country text not null,
  city text,
  positions_required int not null default 1 check (positions_required between 1 and 500),
  skills text[] not null default '{}',
  experience_min numeric check (experience_min is null or experience_min >= 0),
  experience_max numeric check (experience_max is null or experience_max >= 0),
  certifications text[] not null default '{}',
  languages text[] not null default '{}',
  work_mode text not null default 'onsite' check (work_mode in ('onsite', 'remote', 'hybrid')),
  schedule text,
  availability text,
  duration text,
  description text,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  pay_frequency text not null default 'daily' check (pay_frequency in ('hourly', 'daily', 'monthly')),
  initial_offer numeric not null check (initial_offer > 0),
  max_budget numeric not null check (max_budget > 0),
  negotiation_strategy text not null default 'balanced' check (negotiation_strategy in ('conservative', 'balanced', 'flexible')),
  max_rounds int not null default 3 check (max_rounds between 1 and 6),
  outreach_mode text not null default 'approval' check (outreach_mode in ('approval', 'auto')),
  auto_contact_min_score int not null default 70 check (auto_contact_min_score between 0 and 100),
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'closed')),
  retention_days int not null default 180 check (retention_days between 7 and 1095),
  apply_slug text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  closed_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text,
  constraint recruitment_budget_order check (initial_offer <= max_budget),
  constraint recruitment_experience_order check (experience_min is null or experience_max is null or experience_min <= experience_max)
);
create index recruitment_campaigns_org_idx on public.recruitment_campaigns (organization_id, status);

create table public.recruitment_candidates (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  campaign_id text not null references public.recruitment_campaigns (id) on delete cascade,
  full_name text not null,
  headline text,
  country text,
  city text,
  specialization text,
  experience_years numeric check (experience_years is null or experience_years >= 0),
  skills text[] not null default '{}',
  certifications text[] not null default '{}',
  languages text[] not null default '{}',
  profile_text text,
  portfolio_url text,
  cv_path text,
  source text not null check (source in ('manual', 'csv_import', 'company_database', 'referral', 'application', 'integration')),
  source_detail text,
  lawful_basis text not null default 'legitimate_interest'
    check (lawful_basis in ('consent', 'legitimate_interest', 'existing_relationship')),
  contact_enc text,
  contact_hint text,
  expected_comp numeric,
  final_comp numeric,
  availability text,
  status text not null default 'sourced' check (status in (
    'sourced', 'evaluated', 'contacted', 'interested', 'negotiating',
    'awaiting_approval', 'agreed', 'declined', 'hired', 'withdrawn')),
  score int check (score is null or score between 0 and 100),
  score_explanation jsonb,
  evaluated_at timestamptz,
  do_not_contact boolean not null default false,
  portal_token_hash text unique,
  portal_expires_at timestamptz,
  last_contacted_at timestamptz,
  responded_at timestamptz,
  hired_at timestamptz,
  erased_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index recruitment_candidates_campaign_idx on public.recruitment_candidates (campaign_id, status);
create index recruitment_candidates_org_idx on public.recruitment_candidates (organization_id);

create table public.recruitment_messages (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  campaign_id text not null references public.recruitment_campaigns (id) on delete cascade,
  candidate_id text not null references public.recruitment_candidates (id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  channel text not null check (channel in ('email', 'portal')),
  kind text not null default 'outreach' check (kind in ('outreach', 'follow_up', 'negotiation', 'reply', 'confirmation')),
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed', 'received', 'discarded')),
  attempts int not null default 0,
  error text,
  sent_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index recruitment_messages_candidate_idx on public.recruitment_messages (candidate_id, created_date);

create table public.recruitment_offers (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  campaign_id text not null references public.recruitment_campaigns (id) on delete cascade,
  candidate_id text not null references public.recruitment_candidates (id) on delete cascade,
  round int not null default 0,
  party text not null check (party in ('company', 'candidate', 'agent')),
  amount numeric not null check (amount > 0),
  currency text not null,
  pay_frequency text not null,
  outcome text not null check (outcome in ('offer', 'counter', 'request', 'accepted', 'rejected', 'escalated', 'approved', 'declined')),
  note text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index recruitment_offers_candidate_idx on public.recruitment_offers (candidate_id, created_date);

create table public.recruitment_consents (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  candidate_id text not null references public.recruitment_candidates (id) on delete cascade,
  kind text not null check (kind in ('data_processing', 'share_with_company', 'contact')),
  granted boolean not null,
  text_version text not null,
  source text not null check (source in ('portal', 'application')),
  ip_hash text,
  recorded_at timestamptz not null default now(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index recruitment_consents_candidate_idx on public.recruitment_consents (candidate_id, kind, recorded_at desc);

create table public.recruitment_events (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  campaign_id text references public.recruitment_campaigns (id) on delete cascade,
  candidate_id text references public.recruitment_candidates (id) on delete cascade,
  kind text not null,
  level text not null default 'info' check (level in ('info', 'warning', 'error')),
  detail text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index recruitment_events_campaign_idx on public.recruitment_events (campaign_id, created_date desc);

do $$
declare t text;
begin
  foreach t in array array['recruitment_campaigns', 'recruitment_candidates', 'recruitment_messages',
    'recruitment_offers', 'recruitment_consents', 'recruitment_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.tg_stamp_insert()', t || '_stamp_insert', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_stamp_update()', t || '_stamp_update', t);
  end loop;
end $$;
