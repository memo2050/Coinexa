-- Tenant-isolation tests for the RLS policies (local Postgres + auth_stub.sql).
-- Each check raises on failure; the script ends with "ALL RLS CHECKS PASSED".
\set ON_ERROR_STOP on

-- Fixture (as superuser): users B (customer) and C (other customer), admin A.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@test.local', now()),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', now()),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local', now());
insert into public.organizations (id, name) values ('org-b', 'B ws'), ('org-c', 'C ws');
insert into public.organization_members (organization_id, user_id, email, member_role, status) values
  ('org-b', '00000000-0000-0000-0000-00000000000b', 'b@test.local', 'owner', 'active'),
  ('org-c', '00000000-0000-0000-0000-00000000000c', 'c@test.local', 'owner', 'active');
insert into public.agents (id, name, organization_id, created_by_id) values
  ('agent-b', 'B agent', 'org-b', '00000000-0000-0000-0000-00000000000b'),
  ('agent-c', 'C agent', 'org-c', '00000000-0000-0000-0000-00000000000c');
insert into public.agent_tasks (id, agent_id, organization_id, task, created_by_id) values
  ('task-c', 'agent-c', 'org-c', 'secret', '00000000-0000-0000-0000-00000000000c');
insert into public.agent_uploads (id, file_uri, organization_id, created_by_id) values
  ('up-c', 'private/c/file.pdf', 'org-c', '00000000-0000-0000-0000-00000000000c');
insert into public.research_reports (id, query, organization_id, created_by_id) values
  ('rep-c', 'q', 'org-c', '00000000-0000-0000-0000-00000000000c');
insert into public.usage_records (organization_id, user_id, kind, units) values
  ('org-c', '00000000-0000-0000-0000-00000000000c', 'task_run', 3);
insert into public.audit_logs (organization_id, actor_id, action) values
  ('org-c', '00000000-0000-0000-0000-00000000000c', 'task.completed');
insert into public.inquiries (name, email, message, reference) values ('V', 'v@x.test', 'hello', 'NX-1');

create or replace function pg_temp.act_as(uid text, mail text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', mail, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', label; end if;
  raise notice 'pass: %', label;
end $$;

-- ---------- As customer B ----------
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'b@test.local');
set local role authenticated;
select pg_temp.check((select count(*) from public.agents) = 1, '1 B lists only own agents');
select pg_temp.check(not exists (select 1 from public.agents where id = 'agent-c'), '2 B cannot open C agent by id');
select pg_temp.check(not exists (select 1 from public.agent_tasks), '3 B cannot see C runs');
select pg_temp.check(not exists (select 1 from public.agent_uploads), '4 B cannot see C uploads');
select pg_temp.check(not exists (select 1 from public.research_reports), '5 B cannot see C reports');
select pg_temp.check(not exists (select 1 from public.usage_records), '6 B cannot see C usage');
select pg_temp.check(not exists (select 1 from public.audit_logs), '7 B cannot see C audit');
select pg_temp.check((select count(*) from public.organizations) = 1, '8 B sees only own workspace');
select pg_temp.check((select count(*) from public.organization_members) = 1, '9 B sees only own membership');
select pg_temp.check(not exists (select 1 from public.inquiries), '10 B cannot read inquiries');
with u as (update public.agents set name = 'pwned' where id = 'agent-c' returning 1)
  select pg_temp.check((select count(*) from u) = 0, '11 B cannot modify C agent');
with d as (delete from public.agents where id = 'agent-c' returning 1)
  select pg_temp.check((select count(*) from d) = 0, '12 B cannot delete C agent');
insert into public.agents (id, name, organization_id, created_by_id)
  values ('agent-b2', 'B second', 'org-b', '00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select created_by_id from public.agents where id = 'agent-b2') = '00000000-0000-0000-0000-00000000000b',
  '13 creator is stamped from the session, spoofed creator ignored');
update public.agents set created_by_id = '00000000-0000-0000-0000-00000000000c' where id = 'agent-b2';
select pg_temp.check((select created_by_id from public.agents where id = 'agent-b2') = '00000000-0000-0000-0000-00000000000b',
  '14 creator cannot be changed by update');
commit;

-- Inserts into a foreign workspace must be refused (each in its own transaction).
do $$ begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.agents (name, organization_id) values ('x', 'org-c');
    raise exception 'FAIL: 15 B created an agent in C workspace';
  exception when insufficient_privilege then raise notice 'pass: 15 B cannot create in C workspace';
  end;
  begin
    insert into public.agent_tasks (agent_id, organization_id, task) values ('agent-c', 'org-c', 'x');
    raise exception 'FAIL: 16 B created a run in C workspace';
  exception when insufficient_privilege then raise notice 'pass: 16 B cannot create runs in C workspace';
  end;
  begin
    insert into public.usage_records (organization_id, kind) values ('org-b', 'task_run');
    raise exception 'FAIL: 17 B wrote usage';
  exception when insufficient_privilege then raise notice 'pass: 17 B cannot write usage records';
  end;
  begin
    insert into public.organization_members (organization_id, user_id, email, status)
      values ('org-c', '00000000-0000-0000-0000-00000000000b', 'b@test.local', 'active');
    raise exception 'FAIL: 18 B joined C workspace';
  exception when insufficient_privilege then raise notice 'pass: 18 B cannot add itself to another workspace';
  end;
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'FAIL: 19 B promoted itself';
  exception when insufficient_privilege then raise notice 'pass: 19 B cannot change its own role';
  end;
end $$;

-- ---------- Anonymous ----------
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform 1 from public.agents;
    raise exception 'FAIL: 20 anonymous read agents';
  exception when insufficient_privilege then raise notice 'pass: 20 anonymous visitors read nothing';
  end;
end $$;

-- ---------- Removed member loses access ----------
update public.organization_members set status = 'removed' where organization_id = 'org-b';
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'b@test.local');
set local role authenticated;
select pg_temp.check(not exists (select 1 from public.agents), '21 removed member loses workspace access');
commit;
update public.organization_members set status = 'active' where organization_id = 'org-b';

-- ---------- Owner setup script + admin bypass ----------
set owner.email = 'owner@test.local';
\i owner-setup.sql
select pg_temp.check((select role from public.profiles where email = 'owner@test.local') = 'admin', '22 owner setup grants admin');
select pg_temp.check((select o.internal and o.data_class = 'internal' from public.organizations o
  join public.organization_members m on m.organization_id = o.id
  where m.user_id = '00000000-0000-0000-0000-00000000000a'), '23 owner workspace created and marked internal');
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a', 'owner@test.local');
set local role authenticated;
select pg_temp.check((select count(*) from public.agents) = 3, '24 admin sees every workspace');
select pg_temp.check((select count(*) from public.inquiries) = 1, '25 admin reads the studio inbox');
commit;

-- Unconfirmed accounts can never be promoted.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ee', 'nope@test.local');
set owner.email = 'nope@test.local';
do $$ begin
  begin
    perform 1;
  end;
end $$;
\set ON_ERROR_STOP off
\i owner-setup.sql
\set ON_ERROR_STOP on
select pg_temp.check((select role from public.profiles where email = 'nope@test.local') = 'user', '26 unconfirmed account is not promoted');

select 'ALL RLS CHECKS PASSED' as result;
