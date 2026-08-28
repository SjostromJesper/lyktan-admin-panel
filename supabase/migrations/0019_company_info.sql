create table if not exists public.company_info_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  value text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.company_info_fields enable row level security;
alter table public.company_links enable row level security;

create policy "service_role_full_access" on public.company_info_fields
  for all to service_role using (true) with check (true);

create policy "service_role_full_access" on public.company_links
  for all to service_role using (true) with check (true);

alter table public.staff
  add column if not exists company_access text not null default 'none'
    check (company_access in ('none', 'view', 'edit'));
