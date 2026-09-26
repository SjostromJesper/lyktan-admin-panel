-- Local "who's checked in" list for the Event feature. Orders and their
-- fulfillment status live in Shopify — this table only tracks presence at
-- an event, kept deliberately separate from fulfillment (see
-- server/api/events/[id]/deliver.post.ts, a distinct later action).
create table if not exists public.event_checkins (
  id uuid primary key default gen_random_uuid(),
  shopify_product_id text not null,
  shopify_order_id text not null,
  checked_in_at timestamptz not null default now(),
  checked_in_by text,
  unique (shopify_product_id, shopify_order_id)
);

create index if not exists event_checkins_product_idx on public.event_checkins (shopify_product_id);

alter table public.staff
  add column if not exists events_access text not null default 'none'
    check (events_access in ('none', 'view', 'edit'));

alter table public.event_checkins enable row level security;

create policy "service_role_full_access" on public.event_checkins
  for all to service_role using (true) with check (true);
