-- Individual agent hiring, usage allowances and AI cost protection.
--
-- agent_plans    : the price catalog (one row per sellable agent plan). Public read.
-- agents.catalog_key : which plan an agent belongs to (null = the "custom" plan).
-- agent_hires    : one row per hired agent (or featured agent), written ONLY by the
--                  server after Stripe's signed confirmation. Members read their own.
-- agent_usage    : usage per agent per billing period (or the one-off trial),
--                  written ONLY through billing_reserve / billing_release / billing_add_cost.
-- stripe_events  : processed Stripe event ids (each event is applied once).
--
-- "Subject" = what is hired and metered: an agent id, or 'featured:<plan key>' for the
-- workspace-level featured agents (Recruitment, Cyber Security Scan).

create table public.agent_plans (
  key text primary key check (key ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  price_cents int not null check (price_cents > 0),
  currency text not null default 'usd',
  meters jsonb not null,            -- allowance per meter per billing period, e.g. {"unit":300}
  unit_label text not null,         -- what the main meter counts, e.g. 'tasks'
  trial jsonb not null,             -- one-off free allowance per subject, e.g. {"unit":10}
  cost_cap_usd numeric not null check (cost_cap_usd > 0),   -- AI spend cap per period
  trial_cost_cap_usd numeric not null default 1,
  featured boolean not null default false,
  sort int not null default 100,
  active boolean not null default true,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

insert into public.agent_plans (key, name, price_cents, meters, unit_label, trial, cost_cap_usd, featured, sort) values
  ('recruitment', 'AI Recruitment & Talent Sourcing', 7900, '{"evaluation":300,"interview":50,"campaign":3}', 'evaluations', '{"evaluation":10,"interview":1,"campaign":1}', 28.5, true, 1),
  ('cyber-scan', 'Cyber Security Scan', 2900, '{"scan":60}', 'scans', '{"scan":3}', 4.5, true, 2),
  ('marketing-sales', 'Marketing & Sales', 4900, '{"unit":350}', 'tasks', '{"unit":10}', 21, false, 10),
  ('legal', 'Legal Document Assistant', 4900, '{"unit":180}', 'documents', '{"unit":10}', 21.6, false, 11),
  ('crm', 'CRM Management', 3900, '{"unit":300}', 'tasks', '{"unit":10}', 18, false, 20),
  ('real-estate', 'Real Estate', 3900, '{"unit":300}', 'tasks', '{"unit":10}', 18, false, 21),
  ('insurance', 'Insurance', 3900, '{"unit":300}', 'tasks', '{"unit":10}', 18, false, 22),
  ('logistics', 'Logistics & Supply Chain', 3900, '{"unit":300}', 'tasks', '{"unit":10}', 18, false, 23),
  ('dentisched', 'DentiSched', 3900, '{"unit":300}', 'tasks', '{"unit":10}', 18, false, 24),
  ('hazel', 'Hazel (product research)', 3900, '{"unit":60}', 'research reports', '{"unit":3}', 18, false, 25),
  ('custom', 'Custom agent', 3900, '{"unit":300}', 'tasks', '{"unit":10}', 18, false, 26),
  ('customer-support', 'Customer Support', 2900, '{"unit":250}', 'replies', '{"unit":10}', 11.25, false, 30),
  ('resume-screening', 'Resume Screening', 2900, '{"unit":250}', 'resumes', '{"unit":10}', 11.25, false, 31),
  ('fadel', 'Fadel (bookkeeping)', 2900, '{"unit":140}', 'documents', '{"unit":10}', 12.6, false, 32),
  ('flight-booking', 'Flight Booking', 1900, '{"unit":90}', 'requests', '{"unit":5}', 6.75, false, 40);

alter table public.agents add column catalog_key text references public.agent_plans (key);
-- Catalog agents get their plan by name; every other agent is a custom agent (null).
update public.agents set catalog_key = case lower(name)
  when 'customer support agent' then 'customer-support'
  when 'legal document assistant' then 'legal'
  when 'resume screening agent' then 'resume-screening'
  when 'nadia' then 'resume-screening'
  when 'crm management agent' then 'crm'
  when 'real estate agent' then 'real-estate'
  when 'flight booking agent' then 'flight-booking'
  when 'marketing & sales agent' then 'marketing-sales'
  when 'logistics & supply chain agent' then 'logistics'
  when 'insurance agent' then 'insurance'
  when 'dentisched' then 'dentisched'
  when 'fadel' then 'fadel'
  when 'hazel' then 'hazel'
  else null end
where catalog_key is null;

create table public.agent_hires (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  subject text not null check (char_length(subject) between 2 and 120),
  agent_id text references public.agents (id) on delete set null,
  plan_key text not null references public.agent_plans (key),
  status text not null check (status in ('active', 'past_due', 'cancelled', 'ended')),
  stripe_subscription_id text,
  stripe_item_id text unique,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  ends_at timestamptz,               -- set when cancelled: usable until then
  past_due_since timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index agent_hires_org_idx on public.agent_hires (organization_id, subject);
-- At most one live hire per subject per workspace.
create unique index agent_hires_one_live on public.agent_hires (organization_id, subject) where status in ('active', 'past_due', 'cancelled');

create table public.agent_usage (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  subject text not null,
  plan_key text not null references public.agent_plans (key),
  kind text not null check (kind in ('hire', 'trial')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  used jsonb not null default '{}',
  ai_cost_usd numeric not null default 0,
  warned jsonb not null default '{}',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text,
  unique (organization_id, subject, kind, period_start)
);

create table public.stripe_events (
  id text primary key,
  type text not null,
  result text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);

alter table public.organizations add column agent_subscription_id text;

-- Access: the catalog is public; hires and usage are readable by workspace members;
-- every write goes through the server (service role) or the functions below.
alter table public.agent_plans enable row level security;
revoke all on public.agent_plans from anon, authenticated;
grant select on public.agent_plans to anon, authenticated;
create policy agent_plans_read on public.agent_plans for select to anon, authenticated using (active);

alter table public.agent_hires enable row level security;
revoke all on public.agent_hires from anon, authenticated;
grant select on public.agent_hires to authenticated;
create policy agent_hires_read on public.agent_hires for select to authenticated
  using (public.is_member(organization_id) or public.is_platform_admin());

alter table public.agent_usage enable row level security;
revoke all on public.agent_usage from anon, authenticated;
grant select on public.agent_usage to authenticated;
create policy agent_usage_read on public.agent_usage for select to authenticated
  using (public.is_member(organization_id) or public.is_platform_admin());

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['agent_plans', 'agent_hires', 'agent_usage', 'stripe_events'] loop
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['agent_hires', 'agent_usage', 'stripe_events'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function public.tg_stamp_insert()', t || '_stamp_insert', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_stamp_update()', t || '_stamp_update', t);
  end loop;
end $$;

-- Grace after a failed payment before the agent pauses.
create or replace function public.billing_grace() returns interval language sql immutable as $$ select interval '3 days' $$;

-- The live hire for a subject, if any (active, cancelled-but-paid-up, or within grace).
create or replace function public.billing_live_hire(p_org text, p_subject text)
returns public.agent_hires language sql stable security definer set search_path = public as $$
  select h.* from public.agent_hires h
  where h.organization_id = p_org and h.subject = p_subject
    and (
      (h.status = 'active' and now() < h.current_period_end + public.billing_grace())
      or (h.status = 'cancelled' and now() < coalesce(h.ends_at, h.current_period_end))
      or (h.status = 'past_due' and now() < coalesce(h.past_due_since, now()) + public.billing_grace())
    )
  order by h.current_period_end desc limit 1
$$;

-- Reserve p_units of p_meter for a subject. Atomic (row lock), so two requests at the
-- same moment cannot both take the last unit. Returns jsonb:
--   {ok:true, exempt:true}                         internal or legacy-plan workspace
--   {ok:true, usage_id, kind, used, allowance, cap, period_end}
--   {ok:false, reason:'limit'|'trial_over'|'cost_cap'|'no_plan', ...}
create or replace function public.billing_reserve(p_org text, p_subject text, p_plan text, p_meter text, p_units int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org public.organizations;
  plan public.agent_plans;
  hire public.agent_hires;
  v_kind text; v_start timestamptz; v_end timestamptz; v_allow int; v_cap numeric;
  u public.agent_usage; v_used int;
begin
  if p_units < 1 or p_units > 1000 then raise exception 'invalid units'; end if;
  select * into org from public.organizations where id = p_org;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_workspace'); end if;
  -- The platform owner's internal workspace and workspaces on a legacy workspace plan
  -- are not metered per agent.
  if org.internal or coalesce(org.stripe_subscription_id, '') <> '' then
    return jsonb_build_object('ok', true, 'exempt', true);
  end if;
  select * into plan from public.agent_plans where key = p_plan and active;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_plan'); end if;

  hire := public.billing_live_hire(p_org, p_subject);
  if hire.id is not null then
    v_kind := 'hire'; v_start := hire.current_period_start; v_end := hire.current_period_end;
    v_allow := coalesce((plan.meters ->> p_meter)::int, 0); v_cap := plan.cost_cap_usd;
  else
    v_kind := 'trial'; v_start := 'epoch'; v_end := 'infinity';
    v_allow := coalesce((plan.trial ->> p_meter)::int, 0); v_cap := plan.trial_cost_cap_usd;
  end if;

  insert into public.agent_usage (organization_id, subject, plan_key, kind, period_start, period_end)
  values (p_org, p_subject, p_plan, v_kind, v_start, v_end)
  on conflict (organization_id, subject, kind, period_start) do nothing;
  select * into u from public.agent_usage
   where organization_id = p_org and subject = p_subject and kind = v_kind and period_start = v_start
   for update;

  v_used := coalesce((u.used ->> p_meter)::int, 0);
  if u.ai_cost_usd >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'cost_cap', 'kind', v_kind, 'period_end', v_end, 'plan', p_plan);
  end if;
  if v_used + p_units > v_allow then
    return jsonb_build_object('ok', false, 'reason', case when v_kind = 'trial' then 'trial_over' else 'limit' end,
      'kind', v_kind, 'used', v_used, 'allowance', v_allow, 'period_end', v_end, 'plan', p_plan, 'meter', p_meter);
  end if;
  update public.agent_usage set used = jsonb_set(used, array[p_meter], to_jsonb(v_used + p_units)) where id = u.id;
  return jsonb_build_object('ok', true, 'usage_id', u.id, 'kind', v_kind, 'used', v_used + p_units,
    'allowance', v_allow, 'cap', v_cap, 'period_end', v_end, 'plan', p_plan, 'meter', p_meter);
end $$;

-- Give units back (the action failed, so the customer does not pay for it).
create or replace function public.billing_release(p_usage text, p_meter text, p_units int default 1)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.agent_usage
     set used = jsonb_set(used, array[p_meter], to_jsonb(greatest(0, coalesce((used ->> p_meter)::int, 0) - p_units)))
   where id = p_usage;
end $$;

-- Add AI spend to a usage period; returns true while still under the cap.
create or replace function public.billing_add_cost(p_usage text, p_usd numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_cost numeric; v_cap numeric;
begin
  update public.agent_usage set ai_cost_usd = ai_cost_usd + greatest(0, p_usd) where id = p_usage
  returning ai_cost_usd into v_cost;
  select case when u.kind = 'trial' then p.trial_cost_cap_usd else p.cost_cap_usd end into v_cap
    from public.agent_usage u join public.agent_plans p on p.key = u.plan_key where u.id = p_usage;
  return v_cost < v_cap;
end $$;

-- Whether a usage period is still under its AI cost cap (checked before each AI call).
create or replace function public.billing_under_cap(p_usage text)
returns boolean language sql stable security definer set search_path = public as $$
  select u.ai_cost_usd < case when u.kind = 'trial' then p.trial_cost_cap_usd else p.cost_cap_usd end
    from public.agent_usage u join public.agent_plans p on p.key = u.plan_key where u.id = p_usage
$$;

-- The current usage period for a subject without taking a unit (to attach AI cost of
-- follow-on work, e.g. resuming an approved task). Same exemptions as billing_reserve.
create or replace function public.billing_current(p_org text, p_subject text, p_plan text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org public.organizations; hire public.agent_hires; v_kind text; v_start timestamptz; v_end timestamptz; v_id text;
begin
  select * into org from public.organizations where id = p_org;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_workspace'); end if;
  if org.internal or coalesce(org.stripe_subscription_id, '') <> '' then return jsonb_build_object('ok', true, 'exempt', true); end if;
  if not exists (select 1 from public.agent_plans where key = p_plan and active) then return jsonb_build_object('ok', false, 'reason', 'no_plan'); end if;
  hire := public.billing_live_hire(p_org, p_subject);
  if hire.id is not null then v_kind := 'hire'; v_start := hire.current_period_start; v_end := hire.current_period_end;
  else v_kind := 'trial'; v_start := 'epoch'; v_end := 'infinity'; end if;
  insert into public.agent_usage (organization_id, subject, plan_key, kind, period_start, period_end)
  values (p_org, p_subject, p_plan, v_kind, v_start, v_end)
  on conflict (organization_id, subject, kind, period_start) do nothing;
  select id into v_id from public.agent_usage where organization_id = p_org and subject = p_subject and kind = v_kind and period_start = v_start;
  return jsonb_build_object('ok', true, 'usage_id', v_id, 'kind', v_kind, 'period_end', v_end);
end $$;

revoke all on function public.billing_current(text, text, text) from public, anon, authenticated;
grant execute on function public.billing_current(text, text, text) to service_role;
revoke all on function public.billing_live_hire(text, text) from public, anon, authenticated;
revoke all on function public.billing_reserve(text, text, text, text, int) from public, anon, authenticated;
revoke all on function public.billing_release(text, text, int) from public, anon, authenticated;
revoke all on function public.billing_add_cost(text, numeric) from public, anon, authenticated;
revoke all on function public.billing_under_cap(text) from public, anon, authenticated;
grant execute on function public.billing_live_hire(text, text) to service_role;
grant execute on function public.billing_reserve(text, text, text, text, int) to service_role;
grant execute on function public.billing_release(text, text, int) to service_role;
grant execute on function public.billing_add_cost(text, numeric) to service_role;
grant execute on function public.billing_under_cap(text) to service_role;
