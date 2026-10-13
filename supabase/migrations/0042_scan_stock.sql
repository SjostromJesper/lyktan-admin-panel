-- TCG-skanning, fas 7: lagerlista, status per exemplar och logg.

alter table public.scan_items
  -- listed = till salu, sold = såld (ej skickad), shipped = skickad (slutgiltig), removed = borttagen av annat skäl.
  add column if not exists stock_status text
    check (stock_status in ('listed', 'sold', 'shipped', 'removed')),
  add column if not exists sold_at timestamptz,
  add column if not exists sold_channel text
    check (sold_channel in ('butik', 'cardmarket', 'webbshop', 'annat')),
  add column if not exists sold_note text,
  -- Shopify-order som kopplats till exemplaret (fas 7, försäljning i webbshoppen).
  add column if not exists shopify_order_name text;

-- Allt som redan publicerats är till salu.
update public.scan_items set stock_status = 'listed' where publish_status = 'published' and stock_status is null;

create index if not exists scan_items_stock_status_idx on public.scan_items (stock_status) where stock_status is not null;

create table if not exists public.stock_event (
  id uuid primary key default gen_random_uuid(),
  scan_item_id uuid not null references public.scan_items(id) on delete cascade,
  from_status text,
  to_status text not null,
  channel text,
  note text,
  -- Ändring av Shopify-saldot som gjordes (alltid delta, aldrig absolut värde).
  shopify_delta integer not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists stock_event_item_idx on public.stock_event (scan_item_id, created_at desc);

alter table public.stock_event enable row level security;
create policy "service_role_full_access" on public.stock_event
  for all to service_role using (true) with check (true);

-- Lagerlistan läser den här vyn. security_invoker gör att tabellernas RLS gäller (bara service role).
create or replace view public.scan_stock_view with (security_invoker = true) as
select
  i.id,
  i.batch_id,
  b.name as batch_name,
  i."position",
  i.game,
  coalesce(c.name, i.manual_name) as name,
  coalesce(c.set_code, i.manual_set_code) as set_code,
  coalesce(c.set_name, i.manual_set_name) as set_name,
  coalesce(c.collector_number, i.manual_collector_number) as collector_number,
  coalesce(c.rarity, i.manual_rarity) as rarity,
  i.condition,
  i.language,
  i.is_foil,
  i.price_sek,
  i.stock_status,
  i.sales_channel,
  i.shopify_sku,
  i.shopify_product_id,
  i.shopify_variant_id,
  i.shopify_inventory_item_id,
  i.published_at,
  i.image_path,
  i.image_source,
  c.image_url as reference_image_url,
  i.sold_at,
  i.sold_channel,
  i.sold_note,
  i.shopify_order_name
from public.scan_items i
join public.scan_batches b on b.id = i.batch_id
left join public.tcg_cards c on c.id = i.matched_card_id
where i.publish_status = 'published';
