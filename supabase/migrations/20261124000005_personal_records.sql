-- Some original Coinexa features (product research, its run history) save records
-- that belong to the person rather than a workspace (organization_id empty), as
-- Base44 did. Users could already SEE their own personal records; now they can
-- also create, edit and delete them. Workspace records are unchanged: members only.
-- created_by_id is stamped from the JWT by the before-insert trigger, so nobody can
-- create a personal record in someone else's name.
do $$
declare t text;
begin
  foreach t in array array['agents', 'agent_tasks', 'agent_uploads', 'research_reports'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format($f$
      create policy %1$I on public.%2$I for insert to authenticated with check (
        public.is_member(organization_id)
        or ((organization_id is null or organization_id = '') and created_by_id = auth.uid())
        or public.is_platform_admin())$f$, t || '_insert', t);
    execute format($f$
      create policy %1$I on public.%2$I for update to authenticated
        using ((created_by_id = auth.uid() and (public.is_member(organization_id) or organization_id is null or organization_id = ''))
               or public.is_platform_admin())
        with check ((created_by_id = auth.uid() and (public.is_member(organization_id) or organization_id is null or organization_id = ''))
               or public.is_platform_admin())$f$, t || '_update', t);
    execute format($f$
      create policy %1$I on public.%2$I for delete to authenticated using (
        (created_by_id = auth.uid() and (public.is_member(organization_id) or organization_id is null or organization_id = ''))
        or public.is_platform_admin())$f$, t || '_delete', t);
  end loop;
end $$;
