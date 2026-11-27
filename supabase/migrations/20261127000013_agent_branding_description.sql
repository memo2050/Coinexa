-- Featured agents (no agents row) keep an admin-edited description here; workspace
-- agents keep theirs in agents.summary. Written only by the admin function.
alter table public.agent_branding
  add column description text check (description is null or char_length(description) <= 600);
