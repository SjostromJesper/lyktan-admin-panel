create table if not exists public.recurring_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 0=Måndag .. 6=Söndag, matching the rest of the app's week convention.
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  table_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recurring_events_time_order check (end_time > start_time)
);

alter table public.recurring_events enable row level security;

create policy "service_role_full_access" on public.recurring_events
  for all to service_role using (true) with check (true);
