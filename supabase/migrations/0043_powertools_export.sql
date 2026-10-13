-- TCG-skanning, fas 8: export till TCG PowerTools (Cardmarket).

alter table public.scan_items
  add column if not exists exported_to_powertools_at timestamptz,
  -- Satt när ett exemplar som såldes utanför Cardmarket också tagits bort där.
  add column if not exists cardmarket_removed_at timestamptz;

-- Faktor på Cardmarkets trendpris per skick för priset i PowerTools-exporten (EUR).
alter table public.scan_settings
  add column if not exists cardmarket_factors jsonb not null default '{"NM":1,"EX":0.9,"GD":0.8,"LP":0.7,"PL":0.55,"PO":0.4}';

-- Lagerlistan visar nu alla exemplar med lagerstatus (även de som bara säljs på Cardmarket).
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
  i.shopify_order_name,
  i.exported_to_powertools_at,
  i.cardmarket_removed_at
from public.scan_items i
join public.scan_batches b on b.id = i.batch_id
left join public.tcg_cards c on c.id = i.matched_card_id
where i.stock_status is not null;
