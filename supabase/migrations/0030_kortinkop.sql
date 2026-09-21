-- Kortinköp (TCG card buying) — Phase 1: settings, offers and their card
-- lines. See docs/KORTINKOP-SPEC.md for the full business spec. Later
-- phases (inventory items, sales, commission reporting) are intentionally
-- not created here.

create table if not exists public.kortinkop_settings (
  id uuid primary key default gen_random_uuid(),
  default_pct numeric not null default 60,
  fee_kr numeric not null default 50,
  credit_bonus_pct numeric not null default 10,
  valid_days integer not null default 7,
  pickup_days integer not null default 30,
  company_legal_name text not null default 'Lyktan Spel AB',
  company_org_number text not null default '559541-9564',
  company_address text not null default 'Veddestabron 8B, 177 48 Järfälla',
  company_contact text not null default 'butiklyktan.se',
  updated_at timestamptz not null default now()
);

-- Single-row settings table: enforce exactly one row.
create unique index if not exists kortinkop_settings_singleton
  on public.kortinkop_settings ((true));

insert into public.kortinkop_settings (id)
  select gen_random_uuid()
  where not exists (select 1 from public.kortinkop_settings);

create table if not exists public.buy_offers (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,               -- "LYK-YYYYMMDD-NNN"
  status text not null default 'draft'
    check (status in ('draft', 'offered', 'accepted', 'paid', 'declined', 'expired')),

  evaluated_at date not null default current_date,
  valid_days integer not null default 7,
  evaluator_id uuid references public.staff(id),
  evaluator_name text,                        -- snapshot for the printed document

  customer_name text not null default '',
  customer_phone text,
  customer_email text,
  customer_address text,
  customer_submitted_at date,
  customer_note text,
  id_checked boolean not null default false,
  is_minor boolean not null default false,
  guardian_name text,
  marketing_consent boolean not null default false,

  fee_kr numeric not null default 50,
  fee_paid_at_submission boolean not null default true,

  payment_method text not null default 'swish'
    check (payment_method in ('swish', 'bank', 'cash', 'store_credit')),
  payment_to text,

  credit_bonus_pct numeric not null default 10,

  -- Server-computed totals, persisted on every save so the printed
  -- document and later reports don't need to recompute against settings
  -- that may have changed since.
  offer_total_kr numeric,
  credit_bonus_kr numeric,
  fee_effect_kr numeric,
  grand_total_kr numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists buy_offers_status_idx on public.buy_offers (status);
create index if not exists buy_offers_evaluated_at_idx on public.buy_offers (evaluated_at);

create table if not exists public.buy_offer_lines (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.buy_offers(id) on delete cascade,
  sell boolean not null default true,
  name text not null default '',
  card_number text,
  card_set text,
  condition text not null default 'NM'
    check (condition in ('MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO', 'GR')),
  grade text,
  qty integer not null default 1 check (qty > 0),
  market_value_kr numeric not null default 0 check (market_value_kr >= 0),
  pct numeric not null default 60 check (pct >= 0 and pct <= 100),
  note text,
  is_bulk boolean not null default false,
  line_offer_kr numeric not null default 0,   -- floor(market_value_kr * qty * pct / 100), server-computed
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists buy_offer_lines_offer_id_idx on public.buy_offer_lines (offer_id);

alter table public.staff
  add column if not exists kortinkop_access text not null default 'none'
    check (kortinkop_access in ('none', 'view', 'edit'));

alter table public.kortinkop_settings enable row level security;
alter table public.buy_offers enable row level security;
alter table public.buy_offer_lines enable row level security;

create policy "service_role_full_access" on public.kortinkop_settings
  for all to service_role using (true) with check (true);

create policy "service_role_full_access" on public.buy_offers
  for all to service_role using (true) with check (true);

create policy "service_role_full_access" on public.buy_offer_lines
  for all to service_role using (true) with check (true);
