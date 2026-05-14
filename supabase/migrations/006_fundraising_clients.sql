create type public.fundraising_client_stage as enum (
  'signed',
  'onboarding',
  'materials',
  'investor_outreach',
  'meetings',
  'term_sheet',
  'closing',
  'completed',
  'paused'
);

create type public.fundraising_target_stage as enum (
  'target',
  'contact_started',
  'contacted',
  'replied',
  'meeting',
  'diligence',
  'soft_commit',
  'passed',
  'closed'
);

create table public.fundraising_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  mandate_name text not null,
  stage public.fundraising_client_stage not null default 'signed',
  owner_id uuid references auth.users(id) on delete set null,
  primary_contact_person_id uuid references public.people(id) on delete set null,
  signed_on date,
  target_raise_amount_minor bigint,
  target_raise_currency char(3),
  materials_url text,
  data_room_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(mandate_name)) > 0),
  check (target_raise_amount_minor is null or target_raise_amount_minor > 0),
  check (target_raise_currency is null or target_raise_currency ~ '^[A-Z]{3}$'),
  check (
    (target_raise_amount_minor is null and target_raise_currency is null)
    or (target_raise_amount_minor is not null and target_raise_currency is not null)
  )
);

create table public.fundraising_client_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.fundraising_clients(id) on delete cascade,
  investor_company_id uuid references public.companies(id) on delete set null,
  investor_person_id uuid references public.people(id) on delete set null,
  investor_name text not null,
  investor_email text,
  investor_type text,
  ticket_size_min_minor bigint,
  ticket_size_max_minor bigint,
  ticket_size_currency char(3),
  stage public.fundraising_target_stage not null default 'target',
  owner_id uuid references auth.users(id) on delete set null,
  last_contacted_at timestamptz,
  next_step text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(investor_name)) > 0),
  check (ticket_size_min_minor is null or ticket_size_min_minor > 0),
  check (ticket_size_max_minor is null or ticket_size_max_minor > 0),
  check (ticket_size_min_minor is null or ticket_size_max_minor is null or ticket_size_max_minor >= ticket_size_min_minor),
  check (ticket_size_currency is null or ticket_size_currency ~ '^[A-Z]{3}$'),
  check (
    (ticket_size_min_minor is null and ticket_size_max_minor is null and ticket_size_currency is null)
    or (ticket_size_currency is not null and (ticket_size_min_minor is not null or ticket_size_max_minor is not null))
  )
);

create trigger fundraising_clients_touch_updated_at before update on public.fundraising_clients for each row execute function public.touch_updated_at();
create trigger fundraising_client_targets_touch_updated_at before update on public.fundraising_client_targets for each row execute function public.touch_updated_at();

create index fundraising_clients_org_stage_idx on public.fundraising_clients (organization_id, stage, updated_at desc);
create index fundraising_clients_org_company_idx on public.fundraising_clients (organization_id, company_id);
create index fundraising_client_targets_org_client_idx on public.fundraising_client_targets (organization_id, client_id);
create index fundraising_client_targets_org_stage_idx on public.fundraising_client_targets (organization_id, stage, updated_at desc);
create index fundraising_client_targets_org_investor_company_idx on public.fundraising_client_targets (organization_id, investor_company_id) where investor_company_id is not null;
create index fundraising_client_targets_org_investor_person_idx on public.fundraising_client_targets (organization_id, investor_person_id) where investor_person_id is not null;

alter table public.fundraising_clients enable row level security;
alter table public.fundraising_client_targets enable row level security;

create policy fundraising_clients_member_all on public.fundraising_clients
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy fundraising_client_targets_member_all on public.fundraising_client_targets
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
