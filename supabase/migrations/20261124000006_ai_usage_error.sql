-- Keep the provider's error message for failed AI calls (admin-only table), so
-- failures can be diagnosed without digging through function logs.
alter table public.ai_usage add column if not exists error text;
