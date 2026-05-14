create type public.accounting_role as enum ('viewer', 'editor', 'admin');
create type public.accounting_document_type as enum ('retainer', 'commission', 'expense', 'adjustment');
create type public.accounting_document_status as enum ('draft', 'open', 'partially_paid', 'paid', 'void');
create type public.accounting_ledger_entry_type as enum ('retainer_payment', 'commission_payment', 'expense_payment', 'adjustment');
create type public.accounting_direction as enum ('incoming', 'outgoing');
create type public.accounting_audit_action as enum ('create', 'update', 'void', 'delete');
create type public.accounting_audit_entity_type as enum ('document', 'ledger_entry');

create table public.accounting_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.accounting_role not null default 'viewer',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.accounting_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete restrict,
  document_type public.accounting_document_type not null,
  status public.accounting_document_status not null default 'open',
  title text not null,
  amount_minor bigint not null,
  currency char(3) not null,
  issued_on date,
  due_on date,
  external_reference text,
  document_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_minor > 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (document_type not in ('retainer', 'commission') or company_id is not null),
  check ((status = 'void') = (voided_at is not null))
);

create table public.accounting_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid references public.accounting_documents(id) on delete set null,
  company_id uuid references public.companies(id) on delete restrict,
  entry_type public.accounting_ledger_entry_type not null,
  direction public.accounting_direction not null,
  amount_minor bigint not null,
  currency char(3) not null,
  occurred_on date not null default current_date,
  external_reference text,
  document_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_minor > 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (entry_type not in ('retainer_payment', 'commission_payment') or company_id is not null),
  check (
    (entry_type in ('retainer_payment', 'commission_payment') and direction = 'incoming')
    or (entry_type = 'expense_payment' and direction = 'outgoing')
    or entry_type = 'adjustment'
  )
);

create table public.accounting_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action public.accounting_audit_action not null,
  entity_type public.accounting_audit_entity_type not null,
  entity_id uuid not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_accounting_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accounting_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_accounting(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accounting_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.role in ('editor', 'admin')
  );
$$;

create or replace function public.can_admin_accounting(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accounting_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.role = 'admin'
  );
$$;

create trigger accounting_members_touch_updated_at before update on public.accounting_members for each row execute function public.touch_updated_at();
create trigger accounting_documents_touch_updated_at before update on public.accounting_documents for each row execute function public.touch_updated_at();
create trigger accounting_ledger_entries_touch_updated_at before update on public.accounting_ledger_entries for each row execute function public.touch_updated_at();

create index accounting_members_org_role_idx on public.accounting_members (organization_id, role);
create index accounting_documents_org_type_status_idx on public.accounting_documents (organization_id, document_type, status, issued_on desc);
create index accounting_documents_org_company_idx on public.accounting_documents (organization_id, company_id) where company_id is not null;
create index accounting_ledger_entries_org_type_date_idx on public.accounting_ledger_entries (organization_id, entry_type, occurred_on desc);
create index accounting_ledger_entries_org_document_idx on public.accounting_ledger_entries (organization_id, document_id) where document_id is not null;
create index accounting_audit_events_org_entity_idx on public.accounting_audit_events (organization_id, entity_type, entity_id, created_at desc);

alter table public.accounting_members enable row level security;
alter table public.accounting_documents enable row level security;
alter table public.accounting_ledger_entries enable row level security;
alter table public.accounting_audit_events enable row level security;

create policy accounting_members_accounting_read on public.accounting_members
  for select using (public.is_accounting_member(organization_id));

create policy accounting_members_admin_write on public.accounting_members
  for all using (public.can_admin_accounting(organization_id))
  with check (public.can_admin_accounting(organization_id));

create policy accounting_documents_accounting_read on public.accounting_documents
  for select using (public.is_accounting_member(organization_id));

create policy accounting_documents_accounting_insert on public.accounting_documents
  for insert with check (public.can_edit_accounting(organization_id));

create policy accounting_documents_accounting_update on public.accounting_documents
  for update using (public.can_edit_accounting(organization_id))
  with check (public.can_edit_accounting(organization_id));

create policy accounting_documents_accounting_delete on public.accounting_documents
  for delete using (public.can_edit_accounting(organization_id));

create policy accounting_ledger_entries_accounting_read on public.accounting_ledger_entries
  for select using (public.is_accounting_member(organization_id));

create policy accounting_ledger_entries_accounting_insert on public.accounting_ledger_entries
  for insert with check (public.can_edit_accounting(organization_id));

create policy accounting_ledger_entries_accounting_update on public.accounting_ledger_entries
  for update using (public.can_edit_accounting(organization_id))
  with check (public.can_edit_accounting(organization_id));

create policy accounting_ledger_entries_accounting_delete on public.accounting_ledger_entries
  for delete using (public.can_edit_accounting(organization_id));

create policy accounting_audit_events_accounting_read on public.accounting_audit_events
  for select using (public.is_accounting_member(organization_id));

create policy accounting_audit_events_accounting_insert on public.accounting_audit_events
  for insert with check (public.can_edit_accounting(organization_id));
