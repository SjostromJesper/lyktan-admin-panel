create table if not exists public.analytics_pageviews (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  referrer text,
  visitor_hash text not null,
  device_type text not null default 'desktop' check (device_type in ('mobile', 'tablet', 'desktop')),
  created_at timestamptz not null default now()
);

create index if not exists analytics_pageviews_created_at_idx on public.analytics_pageviews (created_at);
create index if not exists analytics_pageviews_path_idx on public.analytics_pageviews (path);

alter table public.analytics_pageviews enable row level security;

create policy "service_role_full_access" on public.analytics_pageviews
  for all to service_role using (true) with check (true);

alter table public.staff
  add column if not exists analytics_access text not null default 'none'
    check (analytics_access in ('none', 'view', 'edit'));
