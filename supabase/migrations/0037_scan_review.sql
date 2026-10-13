-- TCG-skanning, fas 3: granskning av bunt. Skick/språk/foil per exemplar,
-- manuellt inlagda kort, och batchstatus "confirmed".

alter table public.scan_items
  add column if not exists condition text not null default 'NM'
    check (condition in ('NM', 'EX', 'GD', 'LP', 'PL', 'PO')),
  add column if not exists language text not null default 'en',
  add column if not exists is_foil boolean not null default false,
  add column if not exists is_manual boolean not null default false,
  add column if not exists manual_name text,
  add column if not exists manual_set_name text,
  add column if not exists manual_set_code text,
  add column if not exists manual_collector_number text,
  add column if not exists manual_rarity text;

alter table public.scan_batches drop constraint if exists scan_batches_status_check;
alter table public.scan_batches
  add constraint scan_batches_status_check
  check (status in ('uploading', 'uploaded', 'identifying', 'review', 'confirmed', 'priced', 'drafted', 'published'));
