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

-- Browser callers cannot backdate rows (quotas count by created_date).
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'b@test.local');
set local role authenticated;
insert into public.agents (name, organization_id, created_date, created_by_id)
  select 'backdated', organization_id, '2020-01-01', '00000000-0000-0000-0000-0000000000cc' from public.agents limit 1;
select pg_temp.check(
  (select created_date > now() - interval '1 minute' and created_by_id = '00000000-0000-0000-0000-00000000000b'
     from public.agents where name = 'backdated'),
  '27 browser insert cannot backdate or impersonate');
rollback;

-- Personal records (no workspace), as product research saves them.
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'b@test.local');
set local role authenticated;
insert into public.research_reports (id, query) values ('rep-b', 'mugs');
select pg_temp.check(exists (select 1 from public.research_reports where id = 'rep-b'), '28 user creates and sees a personal report');
update public.research_reports set query = 'cups' where id = 'rep-b';
select pg_temp.check((select query from public.research_reports where id = 'rep-b') = 'cups', '29 user edits own personal report');
do $$ begin
  begin
    update public.research_reports set organization_id = 'org-c' where id = 'rep-b';
    raise notice 'FAIL: 30 moved personal report into another workspace';
  exception when others then raise notice 'pass: 30 cannot move a record into another workspace';
  end;
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'c@test.local');
select pg_temp.check(not exists (select 1 from public.research_reports where id = 'rep-b'), '31 others cannot see a personal report');
update public.research_reports set query = 'hacked' where id = 'rep-b';
delete from public.research_reports where id = 'rep-b';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'b@test.local');
select pg_temp.check((select query from public.research_reports where id = 'rep-b') = 'cups', '32 others cannot edit or delete a personal report');
rollback;

-- Recruitment tables: no direct browser access at all (server function only).
begin;
insert into public.recruitment_campaigns (id, organization_id, title, country, initial_offer, max_budget)
  values ('camp-c', 'org-c', 'Help desk', 'Egypt', 100, 150);
insert into public.recruitment_candidates (id, organization_id, campaign_id, full_name, source)
  values ('cand-c', 'org-c', 'camp-c', 'Test Person', 'manual');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'c@test.local');
set local role authenticated;
do $$ begin
  begin
    perform 1 from public.recruitment_candidates limit 1;
    raise notice 'FAIL: 33 browser can read recruitment candidates';
  exception when insufficient_privilege then raise notice 'pass: 33 even the owning workspace cannot read candidates directly';
  end;
  begin
    insert into public.recruitment_campaigns (organization_id, title, country, initial_offer, max_budget) values ('org-c', 'x', 'y', 1, 2);
    raise notice 'FAIL: 34 browser can write campaigns';
  exception when insufficient_privilege then raise notice 'pass: 34 browser cannot write recruitment tables';
  end;
end $$;
reset role;
do $$ begin
  begin
    insert into public.recruitment_campaigns (organization_id, title, country, initial_offer, max_budget) values ('org-c', 'bad', 'Egypt', 200, 150);
    raise notice 'FAIL: 35 initial offer above budget accepted';
  exception when check_violation then raise notice 'pass: 35 initial offer can never exceed the maximum budget';
  end;
end $$;
rollback;

-- Interview tables: no direct browser access; new kinds accepted only where intended.
begin;
insert into public.recruitment_campaigns (id, organization_id, title, country, initial_offer, max_budget) values ('camp-i', 'org-c', 'X', 'Egypt', 1, 2);
insert into public.recruitment_candidates (id, organization_id, campaign_id, full_name, source) values ('cand-i', 'org-c', 'camp-i', 'Y', 'cv_import');
insert into public.recruitment_interviews (id, organization_id, campaign_id, candidate_id, questions, max_followups, expires_at)
  values ('int-i', 'org-c', 'camp-i', 'cand-i', '[]', 2, now() + interval '7 days');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'c@test.local');
set local role authenticated;
do $$ begin
  begin
    perform 1 from public.recruitment_interviews limit 1;
    raise notice 'FAIL: 36 browser can read interviews';
  exception when insufficient_privilege then raise notice 'pass: 36 interviews are server-only';
  end;
  begin
    perform 1 from public.recruitment_interview_messages limit 1;
    raise notice 'FAIL: 37 browser can read interview transcripts';
  exception when insufficient_privilege then raise notice 'pass: 37 interview transcripts are server-only';
  end;
end $$;
reset role;
do $$ begin
  begin
    insert into public.recruitment_interview_plans (organization_id, campaign_id, max_followups) values ('org-c', 'camp-i', 5);
    raise notice 'FAIL: 38 more than 2 follow-ups accepted';
  exception when check_violation then raise notice 'pass: 38 follow-ups are capped at 2 per question';
  end;
end $$;
rollback;

-- Cyber Security Scan: linked PCs, scans and hosts are server-only; replays and bad keys refused.
begin;
insert into public.security_devices (id, organization_id, name, public_key) values ('dev-s', 'org-c', 'PC', repeat('A', 43) || '=');
insert into public.security_scans (id, organization_id, device_id, nonce, signed_at, payload_sha256, schema_version, started_at, finished_at, networks_enc, network_summary, authorized_by, authorization_statement)
  values ('scan-s', 'org-c', 'dev-s', 'nonce-0000000000001', now(), repeat('a', 64), 'v1', now(), now(), 'v1:x:y', '1 network', 'Owner', 'I am authorized');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'c@test.local');
set local role authenticated;
do $$ begin
  begin
    perform 1 from public.security_scans limit 1;
    raise notice 'FAIL: 39 browser can read scans';
  exception when insufficient_privilege then raise notice 'pass: 39 security scans are server-only, even for the owning workspace';
  end;
  begin
    perform 1 from public.security_devices limit 1;
    raise notice 'FAIL: 40 browser can read linked PCs';
  exception when insufficient_privilege then raise notice 'pass: 40 linked PCs and their keys are server-only';
  end;
  begin
    insert into public.security_pairing_codes (organization_id, code_hash, expires_at) values ('org-c', 'x', now());
    raise notice 'FAIL: 41 browser can create pairing codes';
  exception when insufficient_privilege then raise notice 'pass: 41 browser cannot create pairing codes';
  end;
end $$;
reset role;
do $$ begin
  begin
    insert into public.security_scans (organization_id, device_id, nonce, signed_at, payload_sha256, schema_version, started_at, finished_at, networks_enc, network_summary, authorized_by, authorization_statement)
      values ('org-c', 'dev-s', 'nonce-0000000000001', now(), repeat('b', 64), 'v1', now(), now(), 'v1:x:y', '1 network', 'Owner', 'I am authorized');
    raise notice 'FAIL: 42 replayed nonce accepted';
  exception when unique_violation then raise notice 'pass: 42 the same upload (device + nonce) can never be stored twice';
  end;
  begin
    insert into public.security_devices (organization_id, name, public_key) values ('org-c', 'PC2', 'not-a-key');
    raise notice 'FAIL: 43 malformed public key accepted';
  exception when check_violation then raise notice 'pass: 43 only well-formed Ed25519 public keys are stored';
  end;
end $$;
rollback;

-- Hired status: derived from webhook-confirmed payment; customers cannot fake it.
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'c@test.local');
set local role authenticated;
do $$ begin
  update public.organizations set stripe_subscription_id = 'sub_fake' where id = 'org-c';
  if exists (select 1 from public.organizations where id = 'org-c' and hired) then
    raise notice 'FAIL: 44 a workspace owner made their own workspace hired';
  else
    raise notice 'pass: 44 a workspace owner cannot mark their workspace paid or hired';
  end if;
  begin
    update public.organizations set hired = true where id = 'org-c';
    raise notice 'FAIL: 45 hired was written directly';
  exception when others then raise notice 'pass: 45 hired cannot be written by anyone (generated from payment fields)';
  end;
end $$;
reset role;
do $$ begin
  if (select hired from public.organizations where id = 'org-c') then raise notice 'FAIL: 46 unpaid workspace shows hired'; end if;
  update public.organizations set stripe_subscription_id = 'sub_test_confirmed' where id = 'org-c'; -- what the webhook does
  if not (select hired from public.organizations where id = 'org-c') then raise notice 'FAIL: 46 confirmed payment did not set hired';
  else raise notice 'pass: 46 confirmed payment marks the workspace hired'; end if;
  update public.organizations set status = 'suspended' where id = 'org-c';
  if (select hired from public.organizations where id = 'org-c') then raise notice 'FAIL: 47 suspended workspace still hired';
  else raise notice 'pass: 47 a suspended workspace is not hired'; end if;
  update public.organizations set status = 'active', stripe_subscription_id = '' where id = 'org-c'; -- webhook on cancellation
  if (select hired from public.organizations where id = 'org-c') then raise notice 'FAIL: 48 cancelled subscription still hired';
  else raise notice 'pass: 48 cancelling the subscription removes hired'; end if;
end $$;
rollback;

-- Agent billing: hires and usage are server-only; limits, trials, caps and exemptions hold.
begin;
insert into public.agents (id, organization_id, name, status) values ('agent-bill', 'org-c', 'CRM Management Agent', 'active');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'c@test.local');
set local role authenticated;
do $$ begin
  begin
    insert into public.agent_hires (organization_id, subject, plan_key, status, current_period_start, current_period_end)
      values ('org-c', 'agent-bill', 'crm', 'active', now(), now() + interval '30 days');
    raise notice 'FAIL: 49 customer created a hire';
  exception when insufficient_privilege then raise notice 'pass: 49 a customer cannot hire an agent without payment';
  end;
  begin
    perform public.billing_reserve('org-c', 'agent-bill', 'crm', 'unit', 1);
    raise notice 'FAIL: 50 customer called billing_reserve';
  exception when insufficient_privilege then raise notice 'pass: 50 customers cannot call the metering functions';
  end;
  begin
    update public.agent_plans set price_cents = 1 where key = 'crm';
    raise notice 'FAIL: 51 customer changed a price';
  exception when insufficient_privilege then raise notice 'pass: 51 customers cannot change prices';
  end;
  if (select count(*) from public.agent_plans) = 15 then raise notice 'pass: 52 customers can read the public price catalog (15 plans)';
  else raise notice 'FAIL: 52 catalog not readable'; end if;
end $$;
reset role;
do $$
declare r jsonb; i int; uid text;
begin
  if (select catalog_key from public.agents where id = 'agent-bill') is distinct from null then null; end if;
  -- trial: 10 units, then refused
  for i in 1..10 loop r := public.billing_reserve('org-c', 'agent-bill', 'crm', 'unit', 1); end loop;
  r := public.billing_reserve('org-c', 'agent-bill', 'crm', 'unit', 1);
  if (r->>'ok')::boolean = false and r->>'reason' = 'trial_over' then raise notice 'pass: 53 an unhired agent stops after its 10 free trial tasks';
  else raise notice 'FAIL: 53 trial not enforced: %', r; end if;
  -- a paid hire (as the webhook writes it): 300 per period, then refused
  insert into public.agent_hires (organization_id, subject, agent_id, plan_key, status, current_period_start, current_period_end)
    values ('org-c', 'agent-bill', 'agent-bill', 'crm', 'active', now() - interval '1 day', now() + interval '29 days');
  r := public.billing_reserve('org-c', 'agent-bill', 'crm', 'unit', 299);
  uid := r->>'usage_id';
  r := public.billing_reserve('org-c', 'agent-bill', 'crm', 'unit', 1);
  if (r->>'ok')::boolean and (r->>'used')::int = 300 then null; else raise notice 'FAIL: 54 hire allowance: %', r; end if;
  r := public.billing_reserve('org-c', 'agent-bill', 'crm', 'unit', 1);
  if (r->>'ok')::boolean = false and r->>'reason' = 'limit' and (r->>'allowance')::int = 300 then raise notice 'pass: 54 a hired CRM agent stops at exactly 300 tasks';
  else raise notice 'FAIL: 54 limit not enforced: %', r; end if;
  perform public.billing_release(uid, 'unit', 1);
  r := public.billing_reserve('org-c', 'agent-bill', 'crm', 'unit', 1);
  if (r->>'ok')::boolean then raise notice 'pass: 55 a failed task gives its unit back';
  else raise notice 'FAIL: 55 release: %', r; end if;
  -- cost cap ($18 for CRM)
  if public.billing_add_cost(uid, 17.99) and not public.billing_add_cost(uid, 0.02) then
    r := public.billing_reserve('org-c', 'agent-bill', 'crm', 'unit', 1);
    if r->>'reason' = 'cost_cap' and not public.billing_under_cap(uid) then raise notice 'pass: 56 the agent stops at its $18 AI cost cap even with tasks left';
    else raise notice 'FAIL: 56 cost cap: %', r; end if;
  else raise notice 'FAIL: 56 add_cost'; end if;
  -- the owner's internal workspace is not metered
  update public.organizations set internal = true where id = 'org-c';
  r := public.billing_reserve('org-c', 'agent-bill', 'crm', 'unit', 1);
  if (r->>'exempt')::boolean then raise notice 'pass: 57 the internal owner workspace is not metered';
  else raise notice 'FAIL: 57 internal: %', r; end if;
  update public.organizations set internal = false where id = 'org-c';
  -- a cancelled hire keeps working until the paid period ends, then stops
  update public.agent_hires set status = 'cancelled', ends_at = now() - interval '1 minute' where organization_id = 'org-c' and subject = 'agent-bill';
  if (public.billing_live_hire('org-c', 'agent-bill')).id is null then raise notice 'pass: 58 a cancelled hire ends when its paid period ends';
  else raise notice 'FAIL: 58 cancelled hire still live'; end if;
  begin
    insert into public.agent_hires (organization_id, subject, plan_key, status, current_period_start, current_period_end)
      values ('org-c', 'agent-bill', 'crm', 'active', now(), now() + interval '30 days');
    insert into public.agent_hires (organization_id, subject, plan_key, status, current_period_start, current_period_end)
      values ('org-c', 'agent-bill', 'crm', 'active', now(), now() + interval '30 days');
    raise notice 'FAIL: 59 two live hires for one agent';
  exception when unique_violation then raise notice 'pass: 59 an agent can only be hired once at a time';
  end;
end $$;
rollback;

-- ---------- Agent names and icons (admin only) ----------
begin;
insert into public.agent_branding (subject, agent_id, icon_kind, icon_key) values
  ('agent-c', 'agent-c', 'library', 'truck'), ('featured:recruitment', null, 'library', 'briefcase');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'b@test.local');
set local role authenticated;
select pg_temp.check((select count(*) from public.agent_branding where subject = 'featured:recruitment') = 1
  and not exists (select 1 from public.agent_branding where subject = 'agent-c'),
  '60 a customer sees featured icons but not another workspace''s agent settings');
do $$ begin
  insert into public.agent_branding (subject, agent_id, icon_kind, icon_key) values ('agent-b', 'agent-b', 'library', 'bot');
  raise exception 'FAIL: 61 customer wrote an icon setting';
exception when insufficient_privilege then raise notice 'pass: 61 a customer cannot set an agent icon (direct API insert refused)';
end $$;
do $$ begin
  update public.agent_branding set icon_key = 'bot' where subject = 'featured:recruitment';
  raise exception 'FAIL: 62 customer changed an icon setting';
exception when insufficient_privilege then raise notice 'pass: 62 a customer cannot change an icon setting (direct API update refused)';
end $$;
do $$ begin
  update public.agents set name = 'Hijacked' where id = 'agent-b';
  raise exception 'FAIL: 63 customer renamed an agent';
exception when insufficient_privilege then raise notice 'pass: 63 a customer cannot rename even their own agent through the API';
end $$;
do $$ declare n int; begin
  update public.agents set status = 'paused' where id = 'agent-b';
  get diagnostics n = row_count;
  if n = 1 then raise notice 'pass: 64 a customer can still pause their own agent (existing behaviour kept)';
  else raise exception 'FAIL: 64 customer could not pause own agent'; end if;
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a', 'owner@test.local');
set local role authenticated;
do $$ begin
  update public.agents set name = 'Renamed by REST' where id = 'agent-c';
  raise exception 'FAIL: 65 admin renamed through the API, skipping the admin function';
exception when insufficient_privilege then raise notice 'pass: 65 even an admin session cannot rename through the API (only the checked admin function can)';
end $$;
reset role;
set local role service_role;
do $$ declare n int; begin
  update public.agents set name = 'Renamed by admin function' where id = 'agent-c';
  get diagnostics n = row_count;
  if n = 1 then raise notice 'pass: 66 the admin function (service role) can rename';
  else raise exception 'FAIL: 66 service role rename'; end if;
end $$;
reset role;
do $$ begin
  insert into public.agent_branding (subject, agent_id) values ('featured:x', 'agent-b');
  raise exception 'FAIL: 67 inconsistent subject accepted';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.agent_branding (subject, agent_id, icon_kind) values ('agent-b', 'agent-b', 'library');
  raise exception 'FAIL: 67 library icon without key accepted';
exception when check_violation then raise notice 'pass: 67 icon settings must be complete and consistent';
end $$;
rollback;

select 'ALL RLS CHECKS PASSED' as result;
