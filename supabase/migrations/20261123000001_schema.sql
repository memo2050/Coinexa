-- Coinexa schema (Stage 2). Mirrors the 10 Base44 entities in base44/entities/*.jsonc.
-- Column names keep the Base44 field names (id, created_date, updated_date,
-- created_by_id, created_by) so the ported server code works unchanged.
-- Fresh start: no data is imported.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

-- Stamps the creator from the caller's JWT. A browser (authenticated) caller can
-- never choose created_by_id; the service role (auth.uid() is null) may set it.
create or replace function public.tg_stamp_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is null or new.id = '' then
    new.id := gen_random_uuid()::text;
  end if;
  new.created_date := coalesce(new.created_date, now());
  new.updated_date := now();
  if auth.uid() is not null then
    new.created_by_id := auth.uid();
    new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  end if;
  return new;
end $$;

-- Identity columns are immutable for browser callers.
create or replace function public.tg_stamp_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_date := now();
  if auth.uid() is not null then
    new.id := old.id;
    new.created_date := old.created_date;
    new.created_by_id := old.created_by_id;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles  (Base44 built-in User entity)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  -- Server-maintained mirror of active memberships (kept for code compatibility;
  -- access rules test membership directly, see public.is_member).
  organization_ids text[] not null default '{}',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

create or replace function public.tg_profiles_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_date := now();
  return new;
end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.tg_profiles_update();

-- Every new auth user gets a profile with role 'user'. Platform admin is granted
-- only by the owner setup script (supabase/owner-setup.sql), never by sign-up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
create table public.organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  slug text unique,
  industry text,
  size text,
  plan text not null default 'starter' check (plan in ('starter', 'growth', 'scale')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  internal boolean not null default false,
  data_class text not null default 'test' check (data_class in ('customer', 'internal', 'test')),
  stripe_customer_id text,
  stripe_subscription_id text,
  task_limit_month integer,
  agent_limit integer,
  seat_limit integer,
  concurrent_limit integer,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  created_by text
);
create index organizations_stripe_customer_idx on public.organizations (stripe_customer_id);
create index organizations_stripe_sub_idx on public.organizations (stripe_subscription_id);

create table public.organization_members (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  full_name text,
  member_role text not null default 'member' check (member_role in ('owner', 'admin', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  joined_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  created_by text
);
create index organization_members_user_idx on public.organization_members (user_id, status);
create index organization_members_email_idx on public.organization_members (lower(email), status);
create index organization_members_org_idx on public.organization_members (organization_id);

-- ---------------------------------------------------------------------------
-- Agents and runs
-- ---------------------------------------------------------------------------
create table public.agents (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  organization_id text references public.organizations (id) on delete set null,
  specialization text,
  industry_key text,
  industry text,
  business_name text,
  business_description text,
  tasks text,
  responsibilities text[],
  permissions text[],
  tone text,
  tools text[],
  role text,
  summary text,
  goals text[],
  workflow text[],
  workflow_graph jsonb,
  workflow_version numeric,
  workflow_enabled boolean default true,
  knowledge_requirements text[],
  safety_rules text[],
  system_instructions text,
  last_run_status text check (last_run_status in ('succeeded', 'failed')),
  last_run_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  created_by text
);
create index agents_org_idx on public.agents (organization_id);
create index agents_creator_idx on public.agents (created_by_id);
create index agents_status_idx on public.agents (status);

-- Run history survives agent deletion (agent_name is stored for that reason), so
-- agent_id has no foreign key.
create table public.agent_tasks (
  id text primary key default gen_random_uuid()::text,
  execution_id text,
  idempotency_key text,
  agent_id text not null,
  agent_name text,
  organization_id text references public.organizations (id) on delete set null,
  task text not null,
  output text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'awaiting_approval', 'cancelled')),
  error text,
  steps jsonb,
  approvals jsonb,
  progress numeric,
  current_node text,
  awaiting_approval boolean,
  workflow_version numeric,
  warnings text[],
  attachments text[],
  attachment_names text[],
  duration_ms numeric,
  started_at timestamptz,
  finished_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  created_by text
);
create index agent_tasks_org_status_idx on public.agent_tasks (organization_id, status);
create index agent_tasks_org_created_idx on public.agent_tasks (organization_id, created_date);
create index agent_tasks_agent_idx on public.agent_tasks (agent_id, created_date desc);
create unique index agent_tasks_idempotency_idx on public.agent_tasks (created_by_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create table public.agent_uploads (
  id text primary key default gen_random_uuid()::text,
  file_uri text not null,
  file_name text,
  organization_id text references public.organizations (id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  created_by text
);
create index agent_uploads_org_idx on public.agent_uploads (organization_id);

create table public.research_reports (
  id text primary key default gen_random_uuid()::text,
  query text not null,
  organization_id text references public.organizations (id) on delete set null,
  market text default 'Egypt',
  suppliers text[],
  assumptions jsonb,
  products jsonb,
  product_count numeric,
  overall_confidence text
    check (overall_confidence in ('VERIFIED', 'PARTIALLY_VERIFIED', 'ESTIMATED', 'UNVERIFIED', 'UNAVAILABLE')),
  sources jsonb,
  limitations text[],
  summary text,
  researched_at timestamptz,
  agent_id text,
  xlsx_file_uri text,
  xlsx_generated_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  created_by text
);
create index research_reports_org_idx on public.research_reports (organization_id);
create index research_reports_agent_idx on public.research_reports (agent_id);

-- ---------------------------------------------------------------------------
-- Metering, audit, inquiries
-- ---------------------------------------------------------------------------
create table public.usage_records (
  id text primary key default gen_random_uuid()::text,
  organization_id text,
  user_id uuid,
  agent_id text,
  task_id text,
  kind text not null default 'task_run' check (kind in (
    'task_run', 'llm_step', 'knowledge_read', 'chat_reply', 'agent_generation', 'research_run',
    'research_recalc', 'export_xlsx', 'workflow_edit', 'task_approval', 'org_change', 'checkout_attempt')),
  units numeric not null default 0,
  model text,
  input_tokens numeric,
  output_tokens numeric,
  duration_ms numeric,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  created_by text
);
create index usage_records_rate_idx on public.usage_records (user_id, kind, created_date);
create index usage_records_org_idx on public.usage_records (organization_id, created_date);

create table public.audit_logs (
  id text primary key default gen_random_uuid()::text,
  organization_id text,
  actor_id uuid,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  detail text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  created_by text
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_date);
create index audit_logs_action_idx on public.audit_logs (action);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

create table public.inquiries (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text not null,
  service text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_review', 'contacted', 'closed')),
  reference text unique,
  submitted_at timestamptz,
  studio_notified_at timestamptz,
  studio_notify_status text,
  visitor_ack_status text,
  visitor_ack_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  created_by text
);
create index inquiries_status_idx on public.inquiries (status, submitted_at desc);

-- New in Stage 2: one row per AI provider call, written by the AI adapter.
-- Backs the hard monthly AI budget (AI_MONTHLY_BUDGET_USD) and cost reporting.
create table public.ai_usage (
  id text primary key default gen_random_uuid()::text,
  user_id uuid,
  organization_id text,
  function_name text,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  web_searches integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  ok boolean not null default true,
  created_date timestamptz not null default now()
);
create index ai_usage_month_idx on public.ai_usage (created_date);

-- Stamping triggers on every Base44-shaped table.
do $$
declare t text;
begin
  foreach t in array array['organizations', 'organization_members', 'agents', 'agent_tasks',
    'agent_uploads', 'research_reports', 'usage_records', 'audit_logs', 'inquiries'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function public.tg_stamp_insert()', t || '_stamp_insert', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_stamp_update()', t || '_stamp_update', t);
  end loop;
end $$;
