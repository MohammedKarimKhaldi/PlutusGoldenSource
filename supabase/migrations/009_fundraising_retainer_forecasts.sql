alter table public.fundraising_clients
  add column if not exists retainer_cadence text,
  add column if not exists retainer_schedule text,
  add column if not exists retainer_next_billing_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fundraising_clients_retainer_cadence_check'
  ) then
    alter table public.fundraising_clients
      add constraint fundraising_clients_retainer_cadence_check
      check (retainer_cadence is null or retainer_cadence in ('monthly', 'quarterly', 'semiannual', 'annual'));
  end if;
end $$;

alter table public.accounting_documents
  add column if not exists fundraising_client_id uuid,
  add column if not exists retainer_period_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounting_documents_fundraising_client_id_fkey'
  ) then
    alter table public.accounting_documents
      add constraint accounting_documents_fundraising_client_id_fkey
      foreign key (fundraising_client_id)
      references public.fundraising_clients(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists accounting_documents_retainer_period_unique_idx
  on public.accounting_documents (organization_id, fundraising_client_id, retainer_period_date)
  where fundraising_client_id is not null and retainer_period_date is not null;

create index if not exists accounting_documents_org_fundraising_client_idx
  on public.accounting_documents (organization_id, fundraising_client_id, retainer_period_date)
  where fundraising_client_id is not null;

notify pgrst, 'reload schema';
