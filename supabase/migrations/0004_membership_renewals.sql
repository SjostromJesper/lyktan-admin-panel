create table if not exists public.membership_renewals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  months integer not null,
  previous_expiry_date date,
  new_expiry_date date not null,
  -- 'admin' = renewed from this admin panel, 'webshop' = purchased on the
  -- store site (for the future checkout integration).
  source text not null check (source in ('admin', 'webshop')),
  -- admin email for source='admin'; order id / customer email for source='webshop'.
  actor text,
  created_at timestamptz not null default now()
);

alter table public.membership_renewals enable row level security;

create policy "service_role_full_access" on public.membership_renewals
  for all
  to service_role
  using (true)
  with check (true);
