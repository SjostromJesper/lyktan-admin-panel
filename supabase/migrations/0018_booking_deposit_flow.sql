-- Bookings now hold a table for up to 4h (capped by the next booking/event
-- on that table), carry an optional customer note, and go through a
-- pending -> confirmed flow gated by a 20kr deposit paid via the webshop's
-- Shopify checkout.
alter type public.booking_status add value if not exists 'pending';

alter table public.bookings
  add column if not exists end_time time,
  add column if not exists notes text,
  add column if not exists shopify_order_id text;

update public.bookings set end_time = (start_time + interval '2 hours')::time where end_time is null;

alter table public.bookings alter column end_time set not null;
