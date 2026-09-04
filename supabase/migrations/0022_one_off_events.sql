create table if not exists public.one_off_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  table_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint one_off_events_time_order check (end_time > start_time)
);

alter table public.one_off_events enable row level security;

create policy "service_role_full_access" on public.one_off_events
  for all to service_role using (true) with check (true);
