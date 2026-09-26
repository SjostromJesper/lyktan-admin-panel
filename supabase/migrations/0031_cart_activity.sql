-- Live "added to cart" activity log for the admin dashboard — see
-- app/pages/index.vue. Written by the web storefront (which has no
-- Supabase schema of its own; see product_interest_signups for the same
-- pattern), read by the admin panel. No customer identity is stored —
-- the storefront carts are anonymous.

create table if not exists public.cart_activity (
  id uuid primary key default gen_random_uuid(),
  product_title text not null,
  variant_title text,
  quantity integer not null default 1 check (quantity > 0),
  price_kr numeric,
  created_at timestamptz not null default now()
);

create index if not exists cart_activity_created_at_idx on public.cart_activity (created_at desc);

alter table public.cart_activity enable row level security;

create policy "service_role_full_access" on public.cart_activity
  for all to service_role using (true) with check (true);
