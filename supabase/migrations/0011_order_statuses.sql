alter table public.orders rename column picked_up_at to completed_at;

update public.orders set status = 'bokad' where status = 'active';
update public.orders set status = 'klar' where status = 'picked_up';

alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check check (status in ('bokad', 'bestalld', 'slut_pa_lager', 'klar'));

alter table public.orders alter column status set default 'bokad';
