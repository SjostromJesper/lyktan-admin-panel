alter table public.members
  drop column if exists active,
  add column if not exists expiry_date date,
  add column if not exists renewed_at date;
