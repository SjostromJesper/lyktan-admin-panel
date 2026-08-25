alter table public.staff
  add column if not exists email text unique,
  add column if not exists can_edit_members boolean not null default false,
  add column if not exists can_edit_staff boolean not null default false,
  add column if not exists can_edit_schedule boolean not null default false;
