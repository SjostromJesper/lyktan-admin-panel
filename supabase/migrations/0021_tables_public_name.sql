-- The customer-facing booking page shows a simplified name per table,
-- separate from the real in-store name staff use. Falls back to `name`
-- when unset.
alter table public.tables
  add column if not exists public_name text;
