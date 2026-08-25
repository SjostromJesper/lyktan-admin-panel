create table if not exists public.member_scans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  member_name text,
  approved boolean not null,
  reason text,
  scanned_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists member_scans_created_at_idx on public.member_scans (created_at desc);

alter table public.member_scans enable row level security;

create policy "service_role_full_access" on public.member_scans
  for all to service_role using (true) with check (true);
