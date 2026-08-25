create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  age integer not null check (age >= 0 and age <= 130),
  active boolean not null default true,
  tier text not null check (tier in ('litet', 'stort')),
  created_at timestamptz not null default now(),
  constraint members_contact_required check (phone is not null or email is not null)
);

-- RLS is enabled with no policies: only the service-role key (used
-- server-side by the admin panel) can read/write this table.
alter table public.members enable row level security;
