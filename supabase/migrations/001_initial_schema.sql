create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin', 'member');
create type public.company_status as enum ('active', 'review', 'archived');
create type public.source_quality as enum ('high', 'medium', 'low', 'review');
create type public.outreach_stage as enum ('Research', 'Selected', 'Ready to Contact', 'Contacted', 'Follow-up', 'Meeting', 'Qualified', 'Not Relevant', 'Closed');
create type public.outreach_status as enum ('active', 'closed');
create type public.activity_type as enum ('email', 'call', 'meeting', 'note', 'status_change');
create type public.task_status as enum ('open', 'done');
create type public.import_status as enum ('queued', 'running', 'completed', 'failed');
create type public.merge_entity_type as enum ('company', 'person');
create type public.merge_action as enum ('auto_merge', 'review', 'new_record');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_company_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.website_domain, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.country, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(new.categories, ' '), '')), 'C');
  return new;
end;
$$;

create or replace function public.set_people_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.display_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.job_title, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.country, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(new.categories, ' '), '')), 'C');
  return new;
end;
$$;

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  sheet_name text,
  row_count integer not null default 0,
  status public.import_status not null default 'queued',
  stats jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.raw_import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_row_number integer not null,
  source_record_id text not null,
  data jsonb not null,
  mapped jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, import_batch_id, source_row_number)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_key text not null,
  name text not null,
  normalized_name text not null,
  website_domain text,
  description text,
  country text,
  categories text[] not null default '{}',
  status public.company_status not null default 'active',
  source_quality public.source_quality not null default 'review',
  merge_confidence numeric(5, 4),
  owner_id uuid references auth.users(id) on delete set null,
  search_vector tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_key)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_record_id text not null,
  display_name text not null,
  normalized_name text not null,
  linkedin_url text,
  job_title text,
  phone_numbers text,
  country text,
  categories text[] not null default '{}',
  connection_strength text,
  search_vector tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_record_id)
);

create table public.person_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  email text not null,
  domain text not null,
  is_primary boolean not null default false,
  is_personal_domain boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table public.company_people (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role_title text,
  relationship_strength text,
  is_highlighted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, company_id, person_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.company_tags (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, company_id, tag_id)
);

create table public.outreach_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  stage public.outreach_stage not null default 'Research',
  status public.outreach_status not null default 'active',
  owner_id uuid references auth.users(id) on delete set null,
  next_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, company_id)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  outreach_id uuid references public.outreach_opportunities(id) on delete cascade,
  activity_type public.activity_type not null,
  summary text not null,
  body text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  outreach_id uuid references public.outreach_opportunities(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  due_date date,
  status public.task_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merge_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id) on delete cascade,
  entity_type public.merge_entity_type not null,
  candidate_key text not null,
  source_record_id text not null,
  target_id uuid,
  confidence numeric(5, 4) not null,
  rule text not null,
  action public.merge_action not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index companies_org_updated_idx on public.companies (organization_id, updated_at desc);
create index companies_org_normalized_idx on public.companies (organization_id, normalized_name);
create index companies_org_domain_idx on public.companies (organization_id, website_domain) where website_domain is not null;
create index companies_search_idx on public.companies using gin (search_vector);
create index people_org_normalized_idx on public.people (organization_id, normalized_name);
create index people_search_idx on public.people using gin (search_vector);
create index person_emails_org_domain_idx on public.person_emails (organization_id, domain);
create index company_people_company_idx on public.company_people (organization_id, company_id);
create index outreach_org_stage_idx on public.outreach_opportunities (organization_id, stage, status);
create index activities_org_company_time_idx on public.activities (organization_id, company_id, occurred_at desc);
create index tasks_org_status_due_idx on public.tasks (organization_id, status, due_date);
create index merge_audit_org_action_idx on public.merge_audit (organization_id, action, confidence);
create index raw_import_rows_org_record_idx on public.raw_import_rows (organization_id, source_record_id);

create trigger companies_touch_updated_at before update on public.companies for each row execute function public.touch_updated_at();
create trigger companies_set_search_vector before insert or update on public.companies for each row execute function public.set_company_search_vector();
create trigger people_touch_updated_at before update on public.people for each row execute function public.touch_updated_at();
create trigger people_set_search_vector before insert or update on public.people for each row execute function public.set_people_search_vector();
create trigger company_people_touch_updated_at before update on public.company_people for each row execute function public.touch_updated_at();
create trigger outreach_touch_updated_at before update on public.outreach_opportunities for each row execute function public.touch_updated_at();
create trigger tasks_touch_updated_at before update on public.tasks for each row execute function public.touch_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.import_batches enable row level security;
alter table public.raw_import_rows enable row level security;
alter table public.companies enable row level security;
alter table public.people enable row level security;
alter table public.person_emails enable row level security;
alter table public.company_people enable row level security;
alter table public.tags enable row level security;
alter table public.company_tags enable row level security;
alter table public.outreach_opportunities enable row level security;
alter table public.notes enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.merge_audit enable row level security;

create policy organizations_member_read on public.organizations
  for select using (public.is_org_member(id));

create policy organization_members_member_read on public.organization_members
  for select using (public.is_org_member(organization_id));

create policy organization_members_admin_write on public.organization_members
  for all using (
    exists (
      select 1 from public.organization_members member
      where member.organization_id = organization_members.organization_id
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members member
      where member.organization_id = organization_members.organization_id
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  );

create policy import_batches_member_all on public.import_batches
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy raw_import_rows_member_all on public.raw_import_rows
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy companies_member_all on public.companies
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy people_member_all on public.people
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy person_emails_member_all on public.person_emails
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy company_people_member_all on public.company_people
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy tags_member_all on public.tags
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy company_tags_member_all on public.company_tags
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy outreach_member_all on public.outreach_opportunities
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy notes_member_all on public.notes
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy activities_member_all on public.activities
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy tasks_member_all on public.tasks
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy merge_audit_member_all on public.merge_audit
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
