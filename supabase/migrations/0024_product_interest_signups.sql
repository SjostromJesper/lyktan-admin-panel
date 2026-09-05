create table if not exists public.product_interest_signups (
  id uuid primary key default gen_random_uuid(),
  product_handle text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (product_handle, email)
);

alter table public.product_interest_signups enable row level security;

create policy "service_role_full_access" on public.product_interest_signups
  for all to service_role using (true) with check (true);
