create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text,
  customer_email text,
  supplier text not null check (supplier in ('games_workshop', 'asmodee')),
  product_line text,
  product_name text not null,
  price_kr numeric,
  deposit_kr numeric,
  notes text,
  status text not null default 'active' check (status in ('active', 'picked_up')),
  ordered_at date not null default current_date,
  picked_up_at date,
  created_at timestamptz not null default now(),
  constraint orders_contact_required check (customer_phone is not null or customer_email is not null)
);

create index if not exists orders_status_idx on public.orders (status);

alter table public.orders enable row level security;

create policy "service_role_full_access" on public.orders
  for all to service_role using (true) with check (true);

alter table public.staff
  add column if not exists orders_access text not null default 'none' check (orders_access in ('none', 'view', 'edit'));
