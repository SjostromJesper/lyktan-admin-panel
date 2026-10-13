-- TCG-skanning, fas 4: priser från Cardmarkets prisguide + prisinställningar.

-- Senaste prisguiden, en rad per Cardmarket-produkt (fylls dagligen av scripts/load-prices.mjs).
create table if not exists public.tcg_prices (
  cardmarket_id integer primary key,
  game text not null check (game in ('mtg', 'pokemon')),
  trend numeric(10, 2),
  low numeric(10, 2),
  avg1 numeric(10, 2),
  avg7 numeric(10, 2),
  avg30 numeric(10, 2),
  trend_foil numeric(10, 2),
  low_foil numeric(10, 2),
  avg30_foil numeric(10, 2),
  updated_at timestamptz not null default now()
);

-- Prisinställningar: en enda rad (id = 1).
create table if not exists public.scan_settings (
  id integer primary key default 1 check (id = 1),
  -- EUR -> SEK. Uppdateras av prisskriptet om eur_sek_auto är på.
  eur_sek numeric(8, 4) not null default 11.0,
  eur_sek_auto boolean not null default true,
  eur_sek_updated_at timestamptz,
  -- Faktor på trendpriset per skick (NM = 1).
  condition_factors jsonb not null default '{"NM":1,"EX":0.9,"GD":0.8,"LP":0.7,"PL":0.55,"PO":0.4}',
  -- 'ceil' = uppåt till hela kronor, 'x9' = uppåt till närmaste tal som slutar på 9, 'ceil5' = uppåt till närmaste 5 kr.
  rounding text not null default 'ceil' check (rounding in ('ceil', 'x9', 'ceil5')),
  min_price_sek integer not null default 5,
  -- Flaggor: pris över gränsen, trend mer än N gånger lowpriset.
  flag_high_price_sek integer not null default 500,
  flag_trend_low_ratio numeric(5, 2) not null default 3,
  -- Inköpserbjudande: procent av försäljningsvärdet.
  purchase_percent numeric(5, 2) not null default 50,
  prices_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.scan_settings (id) values (1) on conflict (id) do nothing;

alter table public.scan_batches
  add column if not exists purchase_percent numeric(5, 2);

alter table public.scan_items
  add column if not exists price_trend_eur numeric(10, 2),
  add column if not exists price_low_eur numeric(10, 2),
  add column if not exists price_avg30_eur numeric(10, 2),
  add column if not exists price_sek integer,
  -- true när priset satts för hand; då skriver "Hämta priser" inte över det.
  add column if not exists price_overridden boolean not null default false,
  add column if not exists price_flags text[] not null default '{}';

alter table public.tcg_prices enable row level security;
alter table public.scan_settings enable row level security;

create policy "service_role_full_access" on public.tcg_prices
  for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.scan_settings
  for all to service_role using (true) with check (true);
