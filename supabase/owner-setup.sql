-- Owner setup (run ONCE per environment, only with the owner's explicit approval).
--
-- Grants Platform Admin to the owner's NEW account and marks the owner's own new
-- workspace as internal (exempt from customer plan caps), which is what Base44's
-- bootstrapOwnerWorkspace did. Nothing else is changed and no data is imported.
--
-- Usage (GitHub Actions "Owner setup" workflow, or the Supabase SQL editor):
--   set owner.email = 'owner@example.com';   -- the email the owner signed up with
--   \i owner-setup.sql
--
-- Safe to re-run: it only ever sets the same values again.

do $$
declare
  owner_email text := lower(current_setting('owner.email', true));
  owner_id uuid;
  owner_org text;
  promoted int;
begin
  if owner_email is null or owner_email = '' then
    raise exception 'Set owner.email first.';
  end if;

  select u.id into owner_id
  from auth.users u
  where lower(u.email) = owner_email
    and (u.email_confirmed_at is not null or u.confirmed_at is not null);
  if owner_id is null then
    raise exception 'No CONFIRMED account with that email. The owner must sign up and verify first.';
  end if;

  update public.profiles set role = 'admin' where id = owner_id;
  get diagnostics promoted = row_count;
  if promoted <> 1 then
    raise exception 'Profile for the owner was not found.';
  end if;

  select m.organization_id into owner_org
  from public.organization_members m
  where m.user_id = owner_id and m.status = 'active' and m.member_role = 'owner'
  order by m.created_date
  limit 1;

  -- No workspace yet (owner has not used the app): create it exactly like
  -- provisionWorkspace in shared/tenancy.ts would, so nothing waits on a re-run.
  if owner_org is null then
    insert into public.organizations (name, slug, plan, status, task_limit_month, agent_limit, seat_limit, concurrent_limit, created_by_id, created_by)
    values (
      coalesce(nullif((select full_name from public.profiles where id = owner_id), ''), split_part(owner_email, '@', 1)) || '''s workspace',
      'owner-' || substr(md5(random()::text), 1, 6),
      'starter', 'active', 100, 3, 2, 1, owner_id, owner_email)
    returning id into owner_org;
    insert into public.organization_members (organization_id, user_id, email, member_role, status, joined_at, created_by_id, created_by)
    values (owner_org, owner_id, owner_email, 'owner', 'active', now(), owner_id, owner_email);
  end if;

  update public.organizations
    set internal = true, data_class = 'internal'
    where id = owner_org;

  update public.profiles
    set organization_ids = (
      select coalesce(array_agg(distinct m.organization_id), '{}')
      from public.organization_members m where m.user_id = owner_id and m.status = 'active')
    where id = owner_id;

  insert into public.audit_logs (organization_id, actor_id, actor_email, action, target_type, target_id, detail)
  values (owner_org, owner_id, owner_email, 'owner.setup', 'User', owner_id::text,
    'Owner setup: platform admin granted; workspace marked internal');

  raise notice 'Owner % is platform admin. Internal workspace: %', owner_email, owner_org;
end $$;
