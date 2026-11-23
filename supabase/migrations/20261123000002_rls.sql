-- Row Level Security. Rule-for-rule translation of the `rls` blocks in
-- base44/entities/*.jsonc (see docs/stage-1/MIGRATION-PLAN.md §3.4).
-- The tenant boundary is an ACTIVE membership row, checked live.

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_member(org text) returns boolean
language sql stable security definer set search_path = '' as $$
  select org is not null and org <> '' and exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_member(text) from public;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.is_member(text) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.agents enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.agent_uploads enable row level security;
alter table public.research_reports enable row level security;
alter table public.usage_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.inquiries enable row level security;
alter table public.ai_usage enable row level security;

-- Anonymous visitors get nothing from any table (the public contact form writes
-- through the submitInquiry function with the service role).
revoke all on all tables in schema public from anon;

-- profiles: own row or admin. Only full_name is editable from the browser; role
-- and organization_ids are server/SQL only.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Workspace-scoped data: Agent, AgentTask, AgentUpload, ResearchReport.
do $$
declare t text;
begin
  foreach t in array array['agents', 'agent_tasks', 'agent_uploads', 'research_reports'] loop
    execute format($f$
      create policy %1$I on public.%2$I for select to authenticated using (
        public.is_member(organization_id)
        or (created_by_id = auth.uid() and (organization_id is null or organization_id = ''))
        or public.is_platform_admin())$f$, t || '_select', t);
    execute format($f$
      create policy %1$I on public.%2$I for insert to authenticated with check (
        public.is_member(organization_id) or public.is_platform_admin())$f$, t || '_insert', t);
    execute format($f$
      create policy %1$I on public.%2$I for update to authenticated
        using ((created_by_id = auth.uid() and public.is_member(organization_id)) or public.is_platform_admin())
        with check ((created_by_id = auth.uid() and public.is_member(organization_id)) or public.is_platform_admin())$f$,
      t || '_update', t);
    execute format($f$
      create policy %1$I on public.%2$I for delete to authenticated using (
        (created_by_id = auth.uid() and public.is_member(organization_id)) or public.is_platform_admin())$f$,
      t || '_delete', t);
  end loop;
end $$;

-- UsageRecord: read by workspace members or admin; written by the server only.
create policy usage_records_select on public.usage_records for select to authenticated
  using (public.is_member(organization_id) or public.is_platform_admin());
create policy usage_records_admin_write on public.usage_records for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- AuditLog: own actions or admin; writes admin/server only.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (actor_id = auth.uid() or public.is_platform_admin());
create policy audit_logs_admin_write on public.audit_logs for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Organization: members read their own workspace; changes admin/server only.
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());
create policy organizations_admin_write on public.organizations for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- OrganizationMember: own membership rows or admin; changes admin/server only.
create policy organization_members_select on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy organization_members_admin_write on public.organization_members for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Inquiry: platform admin only (studio inbox).
create policy inquiries_admin on public.inquiries for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- AI usage ledger: admin read only; written by the server.
create policy ai_usage_admin_read on public.ai_usage for select to authenticated
  using (public.is_platform_admin());
revoke insert, update, delete on public.ai_usage from authenticated;
