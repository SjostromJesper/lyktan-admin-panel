alter table public.staff
  add column if not exists products_access text not null default 'none'
    check (products_access in ('none', 'view', 'edit'));
