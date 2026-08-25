alter table public.staff
  add column if not exists bookings_access text not null default 'none' check (bookings_access in ('none', 'view', 'edit'));
