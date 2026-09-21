alter table public.store_credit_grants
  add column if not exists custom_text text;

alter table public.store_credit_grants
  drop constraint if exists store_credit_grants_fields_match_type;

alter table public.store_credit_grants
  drop constraint if exists store_credit_grants_type_check;

alter table public.store_credit_grants
  add constraint store_credit_grants_type_check check (type in ('store_credit', 'event_access', 'custom'));

alter table public.store_credit_grants
  add constraint store_credit_grants_fields_match_type check (
    (type = 'store_credit' and amount_kr is not null and event_name is null and custom_text is null)
    or
    (type = 'event_access' and event_name is not null and amount_kr is null and custom_text is null)
    or
    (type = 'custom' and custom_text is not null and amount_kr is null and event_name is null)
  );
