-- Store credit moves from one-off grant rows to a per-person running balance:
-- one account per customer, adjusted up (top-up) or down (spend) over time,
-- with every adjustment logged as a transaction. Event access / custom perks
-- stay as one-off objects in store_credit_grants.

create table if not exists public.store_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  balance_kr numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.store_credit_accounts(id) on delete cascade,
  amount_kr numeric not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.store_credit_accounts enable row level security;

create policy "service_role_full_access" on public.store_credit_accounts
  for all to service_role using (true) with check (true);

alter table public.store_credit_transactions enable row level security;

create policy "service_role_full_access" on public.store_credit_transactions
  for all to service_role using (true) with check (true);

-- Migrate existing store_credit grants into the new balance model, one
-- account + starting transaction per existing grant.
with migrated as (
  insert into public.store_credit_accounts (customer_name, balance_kr, created_at, updated_at)
  select customer_name, amount_kr, created_at, created_at
  from public.store_credit_grants
  where type = 'store_credit'
  returning id, customer_name, balance_kr, created_at
)
insert into public.store_credit_transactions (account_id, amount_kr, note, created_at)
select migrated.id, migrated.balance_kr, g.reason, migrated.created_at
from migrated
join public.store_credit_grants g
  on g.type = 'store_credit'
  and g.customer_name = migrated.customer_name
  and g.amount_kr = migrated.balance_kr
  and g.created_at = migrated.created_at;

delete from public.store_credit_grants where type = 'store_credit';

alter table public.store_credit_grants
  drop constraint if exists store_credit_grants_fields_match_type;

alter table public.store_credit_grants
  drop constraint if exists store_credit_grants_type_check;

alter table public.store_credit_grants
  add constraint store_credit_grants_type_check check (type in ('event_access', 'custom'));

alter table public.store_credit_grants
  add constraint store_credit_grants_fields_match_type check (
    (type = 'event_access' and event_name is not null and custom_text is null)
    or
    (type = 'custom' and custom_text is not null and event_name is null)
  );

alter table public.store_credit_grants
  drop column if exists amount_kr;
