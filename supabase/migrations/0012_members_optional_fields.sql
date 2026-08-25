alter table public.members
  alter column age drop not null;

alter table public.members
  drop constraint if exists members_contact_required;
