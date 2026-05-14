alter type public.accounting_audit_action add value if not exists 'delete';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'accounting_documents'
      and policyname = 'accounting_documents_accounting_delete'
  ) then
    create policy accounting_documents_accounting_delete on public.accounting_documents
      for delete using (public.can_edit_accounting(organization_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'accounting_ledger_entries'
      and policyname = 'accounting_ledger_entries_accounting_delete'
  ) then
    create policy accounting_ledger_entries_accounting_delete on public.accounting_ledger_entries
      for delete using (public.can_edit_accounting(organization_id));
  end if;
end $$;
