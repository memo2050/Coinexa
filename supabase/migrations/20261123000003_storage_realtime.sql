-- Private file storage (replaces Base44 UploadPrivateFile / CreateFileSignedUrl)
-- and realtime for run status (replaces base44.entities.AgentTask.subscribe).
-- Guarded so the migration also applies to a plain Postgres used for local tests.

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('private', 'private', false, 26214400)
    on conflict (id) do nothing;

    -- Browser uploads go under <user id>/..., nowhere else. Nobody reads the bucket
    -- directly: server functions check access and hand out short-lived signed URLs.
    execute $p$
      create policy private_upload_own_folder on storage.objects for insert to authenticated
      with check (bucket_id = 'private' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.agent_tasks;
  end if;
end $$;
