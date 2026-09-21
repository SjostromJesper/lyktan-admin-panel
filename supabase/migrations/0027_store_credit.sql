alter table public.staff
  add column if not exists store_credit_access text not null default 'none'
    check (store_credit_access in ('none', 'view', 'edit'));

create table if not exists public.store_credit_grants (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  type text not null check (type in ('store_credit', 'event_access')),
  amount_kr numeric,
  event_name text,
  reason text,
  redeemed boolean not null default false,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint store_credit_grants_fields_match_type check (
    (type = 'store_credit' and amount_kr is not null and event_name is null)
    or
    (type = 'event_access' and event_name is not null and amount_kr is null)
  )
);

alter table public.store_credit_grants enable row level security;

create policy "service_role_full_access" on public.store_credit_grants
  for all to service_role using (true) with check (true);
