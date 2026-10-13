-- TCG-skanning, fas 2: referensdata (kort + set), bildhash-matchning och
-- identifieringsfält på inskannade kort.

create extension if not exists pg_trgm;

create table if not exists public.tcg_sets (
  game text not null check (game in ('mtg', 'pokemon')),
  code text not null,
  name text not null,
  released_at date,
  -- Antal kort enligt källan vid senaste synk, och hur många vi faktiskt har
  -- laddat. Skiljer de sig åt hämtar referensskriptet om setet (inkrementellt).
  source_card_count integer,
  loaded_card_count integer not null default 0,
  synced_at timestamptz,
  primary key (game, code)
);

create table if not exists public.tcg_cards (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('mtg', 'pokemon')),
  -- Scryfall-id (mtg) eller pokemontcg.io-id (pokemon).
  source_id text not null,
  name text not null,
  set_code text not null,
  set_name text not null,
  collector_number text not null,
  rarity text,
  lang text not null default 'en',
  image_url text,
  finishes text[] not null default '{}',
  cardmarket_id integer,
  released_at date,
  -- 64-bitars dHash av referensbilden (samma algoritm som i webbläsaren).
  dhash bigint,
  created_at timestamptz not null default now(),
  unique (game, source_id)
);

create index if not exists tcg_cards_game_idx on public.tcg_cards (game);
create index if not exists tcg_cards_set_idx on public.tcg_cards (game, set_code, collector_number);
create index if not exists tcg_cards_cardmarket_idx on public.tcg_cards (cardmarket_id);
create index if not exists tcg_cards_name_trgm_idx on public.tcg_cards using gin (name gin_trgm_ops);

alter table public.tcg_sets enable row level security;
alter table public.tcg_cards enable row level security;

create policy "service_role_full_access" on public.tcg_sets
  for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.tcg_cards
  for all to service_role using (true) with check (true);

alter table public.scan_items
  add column if not exists matched_card_id uuid references public.tcg_cards(id) on delete set null,
  add column if not exists match_distance integer,
  add column if not exists match_candidates jsonb,
  add column if not exists ocr_text text;

-- Närmaste referenskort per hash (Hamming-avstånd via bit_count). Tar en hel
-- bunts hashar i ett anrop; idx är hashens 1-baserade position i arrayen.
create or replace function public.match_card_hashes(hashes bigint[], p_game text default null, k integer default 8)
returns table (idx integer, card_id uuid, distance integer)
language sql
stable
as $$
  select h.ord::integer, c.id, c.dist
  from unnest(hashes) with ordinality as h(hash, ord)
  cross join lateral (
    select tc.id, bit_count((tc.dhash # h.hash)::bit(64))::integer as dist
    from public.tcg_cards tc
    where tc.dhash is not null and (p_game is null or tc.game = p_game)
    order by bit_count((tc.dhash # h.hash)::bit(64))
    limit k
  ) c;
$$;
