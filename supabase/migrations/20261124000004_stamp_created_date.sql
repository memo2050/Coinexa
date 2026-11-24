-- Signed-in (browser) callers can no longer choose created_date on insert.
-- Monthly quotas and "last 90 seconds" checks count rows by created_date, so a
-- backdated row could slip past them. Server code (service role) keeps the
-- ability to set it, as before.
create or replace function public.tg_stamp_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is null or new.id = '' then
    new.id := gen_random_uuid()::text;
  end if;
  if auth.uid() is not null then
    new.created_date := now();
    new.created_by_id := auth.uid();
    new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  else
    new.created_date := coalesce(new.created_date, now());
  end if;
  new.updated_date := now();
  return new;
end $$;
