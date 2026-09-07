create table if not exists public.gw_catalog (
  id uuid primary key default gen_random_uuid(),
  ss_code text not null unique,
  product_code text,
  description text not null,
  system text,
  race text,
  module text,
  release_date date,
  barcode text,
  price_retail_kr numeric,
  price_dealer_kr numeric,
  updated_at timestamptz not null default now()
);

create index if not exists gw_catalog_system_idx on public.gw_catalog (system);
create index if not exists gw_catalog_race_idx on public.gw_catalog (race);

alter table public.gw_catalog enable row level security;

create policy "service_role_full_access" on public.gw_catalog
  for all to service_role using (true) with check (true);
