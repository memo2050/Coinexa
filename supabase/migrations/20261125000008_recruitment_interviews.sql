-- Recruitment Phase 1: text-only AI interviews, company CV import, hiring-manager
-- reports. Same rules as migration 007: no browser access to these tables; the
-- `recruitment` server function is the only way in, scoped to one workspace.

alter table public.recruitment_campaigns
  add column if not exists hiring_manager_name text,
  add column if not exists hiring_manager_email text;

alter table public.recruitment_candidates
  add column if not exists cv_text text;

-- CVs imported by the company itself.
alter table public.recruitment_candidates drop constraint if exists recruitment_candidates_source_check;
alter table public.recruitment_candidates add constraint recruitment_candidates_source_check
  check (source in ('manual', 'csv_import', 'company_database', 'referral', 'application', 'integration', 'cv_import'));

-- Consent to a written interview conducted by an AI.
alter table public.recruitment_consents drop constraint if exists recruitment_consents_kind_check;
alter table public.recruitment_consents add constraint recruitment_consents_kind_check
  check (kind in ('data_processing', 'share_with_company', 'contact', 'ai_interview'));

-- Interview invitations and reports to the hiring manager are messages too.
alter table public.recruitment_messages drop constraint if exists recruitment_messages_kind_check;
alter table public.recruitment_messages add constraint recruitment_messages_kind_check
  check (kind in ('outreach', 'follow_up', 'negotiation', 'reply', 'confirmation', 'interview_invite', 'hiring_report'));

-- One interview plan per campaign: the same core questions for every candidate.
create table public.recruitment_interview_plans (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  campaign_id text not null unique references public.recruitment_campaigns (id) on delete cascade,
  questions jsonb not null default '[]'::jsonb, -- [{ id, question, criterion, strong_answer }]
  max_followups int not null default 2 check (max_followups between 0 and 2),
  valid_days int not null default 7 check (valid_days between 1 and 30),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_at timestamptz,
  approved_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);

create table public.recruitment_interviews (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  campaign_id text not null references public.recruitment_campaigns (id) on delete cascade,
  candidate_id text not null references public.recruitment_candidates (id) on delete cascade,
  questions jsonb not null, -- frozen copy of the approved plan at invitation time
  max_followups int not null,
  status text not null default 'invited' check (status in ('invited', 'in_progress', 'completed', 'evaluated', 'expired', 'cancelled')),
  current_index int not null default 0,
  followups_used int not null default 0, -- for the current question
  expires_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  evaluation jsonb,
  score int check (score is null or score between 0 and 100),
  evaluated_at timestamptz,
  report_sent_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index recruitment_interviews_candidate_idx on public.recruitment_interviews (candidate_id, created_date desc);
create index recruitment_interviews_campaign_idx on public.recruitment_interviews (campaign_id, status);

create table public.recruitment_interview_messages (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations (id) on delete cascade,
  interview_id text not null references public.recruitment_interviews (id) on delete cascade,
  role text not null check (role in ('agent', 'candidate')),
  kind text not null check (kind in ('intro', 'question', 'followup', 'answer', 'closing')),
  question_index int,
  content text not null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  created_by text
);
create index recruitment_interview_messages_idx on public.recruitment_interview_messages (interview_id, created_date);

do $$
declare t text;
begin
  foreach t in array array['recruitment_interview_plans', 'recruitment_interviews', 'recruitment_interview_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.tg_stamp_insert()', t || '_stamp_insert', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_stamp_update()', t || '_stamp_update', t);
  end loop;
end $$;
