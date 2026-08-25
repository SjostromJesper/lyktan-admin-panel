alter table public.members
  add column if not exists qr_token text unique default gen_random_uuid()::text;

update public.members set qr_token = gen_random_uuid()::text where qr_token is null;

alter table public.members alter column qr_token set not null;
