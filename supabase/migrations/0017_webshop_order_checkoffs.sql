-- Tracks which Shopify webshop orders staff have handled/picked-up, without
-- touching Shopify's own fulfillment status. Orders themselves live in
-- Shopify — this table is just the local checklist.
create table if not exists public.webshop_order_checkoffs (
  shopify_order_id text primary key,
  checked_at timestamptz not null default now(),
  checked_by text
);

alter table public.webshop_order_checkoffs enable row level security;

create policy "service_role_full_access" on public.webshop_order_checkoffs
  for all
  to service_role
  using (true)
  with check (true);
