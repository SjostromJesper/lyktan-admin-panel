-- TCG-skanning: färgdeskriptor (16x12 RGB av illustrationsytan, normaliserad per
-- bild = 576 värden) för matchning. Testad mot 25 000 kort: rätt kort på första
-- plats 8/8 med god marginal, där 64-bitars-hashen bara klarade 2/8 mot hela
-- databasen. halfvec = 2 byte/värde (ca 115 MB för ~100 000 kort).

create extension if not exists vector;

alter table public.tcg_cards add column if not exists art_vec halfvec(576);
alter table public.scan_items add column if not exists art_vec halfvec(576);

-- Närmaste referenskort per vektor (L2). vecs är textlistor som '[0.1,-0.3,...]'.
create or replace function public.match_card_vectors(vecs text[], p_game text default null, k integer default 8)
returns table (idx integer, card_id uuid, distance double precision)
language sql
stable
as $$
  select v.ord::integer, c.id, c.dist
  from unnest(vecs) with ordinality as v(vec, ord)
  cross join lateral (
    select tc.id, (tc.art_vec <-> v.vec::halfvec(576))::double precision as dist
    from public.tcg_cards tc
    where tc.art_vec is not null and (p_game is null or tc.game = p_game)
    order by tc.art_vec <-> v.vec::halfvec(576)
    limit k
  ) c;
$$;

-- Massuppdatering av referensvektorer från skriptet: [{"id": "...", "v": "[...]"}, ...]
create or replace function public.set_card_vectors(p jsonb)
returns integer
language sql
as $$
  with updated as (
    update public.tcg_cards c
    set art_vec = (e.value ->> 'v')::halfvec(576)
    from jsonb_array_elements(p) as e
    where c.id = (e.value ->> 'id')::uuid
    returning 1
  )
  select count(*)::integer from updated;
$$;
