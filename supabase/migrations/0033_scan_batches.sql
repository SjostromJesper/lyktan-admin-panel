-- TCG-skanning, fas 1: buntar av inskannade kort + bilderna i Supabase Storage.

alter table public.staff
  add column if not exists scan_access text not null default 'none'
    check (scan_access in ('none', 'view', 'edit'));

create table if not exists public.scan_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  status text not null default 'uploading'
    check (status in ('uploading', 'uploaded', 'identifying', 'review', 'priced', 'drafted', 'published')),
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.scan_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.scan_batches(id) on delete cascade,
  -- Plats i den fysiska bunten (1..N) = ordningen på filnamnen.
  position integer not null check (position > 0),
  filename text not null,
  image_path text not null,
  -- 64-bitars dHash av den skannade bilden, beräknad i webbläsaren vid uppladdning
  -- (signerad bigint; matchas med bit_count((a # b)::bit(64)) i Postgres).
  dhash bigint,
  game text check (game in ('mtg', 'pokemon')),
  status text not null default 'pending'
    check (status in ('pending', 'matched', 'needs_review', 'confirmed', 'skipped', 'unidentified')),
  created_at timestamptz not null default now(),
  unique (batch_id, position)
);

create index if not exists scan_items_batch_idx on public.scan_items (batch_id, position);

alter table public.scan_batches enable row level security;
alter table public.scan_items enable row level security;

create policy "service_role_full_access" on public.scan_batches
  for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.scan_items
  for all to service_role using (true) with check (true);

-- Privat bucket; bilder nås bara via signerade URL:er från adminpanelens server.
insert into storage.buckets (id, name, public)
values ('scan-images', 'scan-images', false)
on conflict (id) do nothing;
