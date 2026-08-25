-- Explicit policy so the admin panel's service-role key can read/write
-- regardless of whether the role has BYPASSRLS.
create policy "service_role_full_access" on public.members
  for all
  to service_role
  using (true)
  with check (true);
