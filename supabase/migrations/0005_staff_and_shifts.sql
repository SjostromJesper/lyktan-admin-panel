create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint shifts_time_order check (end_time > start_time)
);

create index if not exists shifts_staff_date_idx on public.shifts (staff_id, shift_date);
create index if not exists shifts_date_idx on public.shifts (shift_date);

alter table public.staff enable row level security;
alter table public.shifts enable row level security;

create policy "service_role_full_access" on public.staff
  for all to service_role using (true) with check (true);

create policy "service_role_full_access" on public.shifts
  for all to service_role using (true) with check (true);
