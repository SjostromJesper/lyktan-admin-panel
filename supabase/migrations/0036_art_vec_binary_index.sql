-- Snabb matchning: exakt L2 över ~100 000 vektorer tog ca 9 s per kort. Ett litet
-- HNSW-index på teckenbitarna (binary_quantize, 576 bitar/kort, ca 25 MB) tar fram
-- kandidater, som sedan omrankas exakt.
--
-- OBS: ersatt av 0038 (indexet missade rätt kort ibland, HNSW är approximativt).
-- Den här filen speglar det som kördes i Supabase.

set statement_timeout = '15min';
set maintenance_work_mem = '128MB';

create index if not exists tcg_cards_art_bits_idx
  on public.tcg_cards
  using hnsw ((binary_quantize(art_vec)::bit(576)) bit_hamming_ops);

create or replace function public.match_card_vectors(vecs text[], p_game text default null, k integer default 8)
returns table (idx integer, card_id uuid, distance double precision)
language plpgsql
stable
set statement_timeout = '30s'
as $$
begin
  -- hnsw.* kan inte sättas i funktionens SET-klausul, bara efter att pgvector laddats.
  perform '[1]'::halfvec(1);
  perform set_config('hnsw.ef_search', '1000', true);

  return query
  select v.ord::integer, c.id, c.dist
  from unnest(vecs) with ordinality as v(vec, ord)
  cross join lateral (select v.vec::halfvec(576) as q offset 0) qv
  cross join lateral (
    select cand.id, (cand.art_vec <-> qv.q)::double precision as dist
    from (
      select tc.id, tc.art_vec
      from public.tcg_cards tc
      where tc.art_vec is not null and (p_game is null or tc.game = p_game)
      order by binary_quantize(tc.art_vec)::bit(576) <~> binary_quantize(qv.q)::bit(576)
      limit 1000
    ) cand
    order by cand.art_vec <-> qv.q
    limit k
  ) c;
end;
$$;
