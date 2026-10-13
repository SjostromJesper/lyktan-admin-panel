-- HNSW-indexet på teckenbitarna är approximativt och missade rätt kort för ett
-- skannat kort (Sally Pride, TMT 225): i en exakt genomsökning av alla 97 725
-- referenskort ligger rätt kort på plats 1 i bit-rankningen, men grafsökningen hittade
-- det inte. Därför görs förfiltret nu som en exakt Hamming-genomsökning av en liten
-- bit-kolumn (72 byte/kort, ca 7 MB) utan index; det tar bara någon tiotal ms per kort.

set statement_timeout = '15min';

alter table public.tcg_cards
  add column if not exists art_bits bit(576)
  generated always as (binary_quantize(art_vec)::bit(576)) stored;

drop index if exists public.tcg_cards_art_bits_idx;

create or replace function public.match_card_vectors(vecs text[], p_game text default null, k integer default 8)
returns table (idx integer, card_id uuid, distance double precision)
language sql
stable
set statement_timeout = '30s'
as $$
  select v.ord::integer, c.id, c.dist
  from unnest(vecs) with ordinality as v(vec, ord)
  -- offset 0 hindrar planeraren från att flytta in castningen i radloopen
  cross join lateral (select v.vec::halfvec(576) as q offset 0) qv
  cross join lateral (select binary_quantize(qv.q)::bit(576) as qb offset 0) qbits
  cross join lateral (
    select cand.id, (cand.art_vec <-> qv.q)::double precision as dist
    from (
      select tc.id, tc.art_vec
      from public.tcg_cards tc
      where tc.art_bits is not null and (p_game is null or tc.game = p_game)
      order by tc.art_bits <~> qbits.qb
      limit 500
    ) cand
    order by cand.art_vec <-> qv.q
    limit k
  ) c;
$$;
