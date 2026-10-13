-- TCG-skanning, fas 5-6: Shopify-publicering per exemplar.

alter table public.scan_items
  -- Vilken kanal exemplaret ska säljas i. Fas 5-6 publicerar bara 'shopify' och 'both'.
  add column if not exists sales_channel text not null default 'shopify'
    check (sales_channel in ('shopify', 'cardmarket', 'both')),
  -- Vilken bild som används i Shopify: den skannade (standard) eller referensbilden.
  add column if not exists image_source text not null default 'scan'
    check (image_source in ('scan', 'reference')),
  add column if not exists shopify_sku text,
  add column if not exists shopify_product_id text,
  add column if not exists shopify_variant_id text,
  add column if not exists shopify_inventory_item_id text,
  -- Satt när saldot räknats upp med 1 i Shopify (hindrar dubbel uppräkning vid omkörning).
  add column if not exists shopify_stocked boolean not null default false,
  add column if not exists publish_status text
    check (publish_status in ('published', 'failed')),
  add column if not exists publish_error text,
  add column if not exists published_at timestamptz;

create index if not exists scan_items_shopify_sku_idx on public.scan_items (shopify_sku) where shopify_sku is not null;
