-- Links a booking to the member it was made as, when the customer's phone
-- or email matched an active membership at booking time. Lets the admin
-- panel show member bookings distinctly, and lets the booking flow skip
-- the deposit for members.
alter table public.bookings
  add column if not exists member_id uuid references public.members(id) on delete set null;
