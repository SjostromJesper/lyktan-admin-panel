alter table public.staff
  add column if not exists members_access text not null default 'none' check (members_access in ('none', 'view', 'edit')),
  add column if not exists staff_access text not null default 'none' check (staff_access in ('none', 'view', 'edit')),
  add column if not exists schedule_access text not null default 'none' check (schedule_access in ('none', 'view', 'edit'));

update public.staff set members_access = case when can_edit_members then 'edit' else 'none' end;
update public.staff set staff_access = case when can_edit_staff then 'edit' else 'none' end;
update public.staff set schedule_access = case when can_edit_schedule then 'edit' else 'none' end;

alter table public.staff
  drop column if exists can_edit_members,
  drop column if exists can_edit_staff,
  drop column if exists can_edit_schedule;
