-- Agent names and icons, managed by the platform admin only.
--
-- agent_branding holds the icon chosen by the admin (an approved library icon or an
-- uploaded image) and the AI suggestion, per agent:
--   subject = an agent id, or 'featured:<key>' for the built-in featured agents
--             (featured:recruitment, featured:cyber-scan), which have no agents row.
-- A workspace agent's name stays in agents.name (so it reads the same everywhere);
-- default_name keeps the name it had before the admin's first change, for "reset".
-- A featured agent's admin name is kept in name.
--
-- Writes happen only through the adminAgentBranding server function (service role,
-- after the admin role + two-step sign-in check). Browsers can read, never write.
create table public.agent_branding (
  subject text primary key,
  agent_id text references public.agents (id) on delete cascade,
  name text check (name is null or char_length(name) between 1 and 80),
  default_name text,
  icon_kind text check (icon_kind in ('library', 'upload')),
  icon_key text check (icon_key is null or icon_key ~ '^[a-z0-9-]{2,30}$'),
  icon_path text,
  icon_version int not null default 0,
  suggested_icon text,
  suggested_reason text,
  suggested_source text check (suggested_source in ('ai', 'rules')),
  suggested_for text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  check ((icon_kind is null and icon_key is null and icon_path is null)
      or (icon_kind = 'library' and icon_key is not null and icon_path is null)
      or (icon_kind = 'upload' and icon_path is not null and icon_key is null)),
  check ((subject ~ '^featured:[a-z0-9-]+$' and agent_id is null) or subject = agent_id)
);
create index agent_branding_agent_idx on public.agent_branding (agent_id);

alter table public.agent_branding enable row level security;
-- Featured agents are visible to every signed-in user; a workspace agent's settings
-- only to those who can see that agent (same rule as the agents table).
create policy agent_branding_select on public.agent_branding for select to authenticated using (
  agent_id is null
  or exists (select 1 from public.agents a where a.id = agent_id and (
       public.is_member(a.organization_id)
       or (a.created_by_id = auth.uid() and (a.organization_id is null or a.organization_id = ''))
       or public.is_platform_admin())));
revoke all on public.agent_branding from anon, authenticated;
grant select on public.agent_branding to authenticated;
grant all on public.agent_branding to service_role;

-- Agent names change only through the admin function. Before this, the table's update
-- rule let an agent's creator (or an admin without two-step sign-in) rename it with a
-- direct API call; the website itself never renames agents.
create or replace function public.agents_name_admin_only() returns trigger
language plpgsql as $$
begin
  if new.name is distinct from old.name and current_user in ('authenticated', 'anon') then
    raise exception 'Agent names can only be changed by the platform admin.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger agents_name_admin_only before update of name on public.agents
  for each row execute function public.agents_name_admin_only();

-- Uploaded icons: public to read (shown on agent cards), written only by the server
-- function after validation (no insert/update/delete policy for browsers).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('agent-icons', 'agent-icons', true, 262144, array['image/png', 'image/webp', 'image/svg+xml'])
    on conflict (id) do nothing;
  end if;
end $$;
