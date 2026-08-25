alter table public.orders
  add column if not exists product_code text;
