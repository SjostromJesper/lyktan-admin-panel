-- Matchningen blev långsam (10-27 s) när databasens cache var kall: förfiltret läste
-- hela tcg_cards (ca 150 MB med vektorerna) för varje sökning. Teckenbitarna ligger
-- därför i en egen smal tabell (ca 12 MB) som snabbt läses in och stannar i cachen;
-- bara de 500 bästa kandidaterna hämtas sedan från tcg_cards för exakt omrankning.

set statement_timeout = '15min';

create table if not exists public.tcg_card_bits (
  card_id uuid primary key references public.tcg_cards(id) on delete cascade,
  game text not null,
  bits bit(576) not null
);

alter table public.tcg_card_bits enable row level security;
create policy "service_role_full_access" on public.tcg_card_bits
  for all to service_role using (true) with check (true);

insert into public.tcg_card_bits (card_id, game, bits)
select id, game, binary_quantize(art_vec)::bit(576)
from public.tcg_cards
where art_vec is not null
on conflict (card_id) do update set game = excluded.game, bits = excluded.bits;

-- Håller tabellen i takt med tcg_cards när referensskriptet lägger till eller ändrar kort.
create or replace function public.sync_card_bits() returns trigger
language plpgsql as $$
begin
  if new.art_vec is null then
    delete from public.tcg_card_bits where card_id = new.id;
  else
    insert into public.tcg_card_bits (card_id, game, bits)
    values (new.id, new.game, binary_quantize(new.art_vec)::bit(576))
    on conflict (card_id) do update set game = excluded.game, bits = excluded.bits;
  end if;
  return new;
end;
$$;

drop trigger if exists tcg_cards_sync_bits on public.tcg_cards;
create trigger tcg_cards_sync_bits
  after insert or update of art_vec, game on public.tcg_cards
  for each row execute function public.sync_card_bits();

-- Kolumnen från 0038 behövs inte längre.
alter table public.tcg_cards drop column if exists art_bits;

create or replace function public.match_card_vectors(vecs text[], p_game text default null, k integer default 8)
returns table (idx integer, card_id uuid, distance double precision)
language sql
stable
set statement_timeout = '30s'
as $$
  select v.ord::integer, c.id, c.dist
  from unnest(vecs) with ordinality as v(vec, ord)
  cross join lateral (select v.vec::halfvec(576) as q offset 0) qv
  cross join lateral (select binary_quantize(qv.q)::bit(576) as qb offset 0) qbits
  cross join lateral (
    select tc.id, (tc.art_vec <-> qv.q)::double precision as dist
    from (
      select b.card_id
      from public.tcg_card_bits b
      where p_game is null or b.game = p_game
      order by b.bits <~> qbits.qb
      limit 500
    ) cand
    join public.tcg_cards tc on tc.id = cand.card_id
    order by tc.art_vec <-> qv.q
    limit k
  ) c;
$$;
