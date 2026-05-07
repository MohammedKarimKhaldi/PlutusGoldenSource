create type public.company_enrichment_status as enum ('pending', 'completed', 'needs_review', 'failed');
create type public.investment_status as enum ('prospect', 'past_investor', 'current_investor');
create type public.investment_capacity_status as enum ('unknown', 'available', 'fully_allocated');
create type public.investment_deal_status as enum ('prospective', 'active', 'closed', 'passed');

create table public.company_enrichments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status public.company_enrichment_status not null default 'pending',
  summary text,
  industry text,
  subsector text,
  company_type text,
  location text,
  keywords text[] not null default '{}',
  source_url text,
  model text,
  confidence numeric(5, 4),
  error_message text,
  generated_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, company_id)
);

create table public.investment_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  relationship_key text not null,
  company_id uuid references public.companies(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  investment_status public.investment_status not null default 'prospect',
  capacity_status public.investment_capacity_status not null default 'unknown',
  notes text,
  last_invested_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, relationship_key),
  check (company_id is not null or person_id is not null)
);

create table public.investment_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  status public.investment_deal_status not null default 'prospective',
  invested_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.investment_deal_participants (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deal_id uuid not null references public.investment_deals(id) on delete cascade,
  relationship_id uuid not null references public.investment_relationships(id) on delete cascade,
  role text,
  notes text,
  created_at timestamptz not null default now(),
  primary key (organization_id, deal_id, relationship_id)
);

create or replace function public.set_investment_relationship_key()
returns trigger
language plpgsql
as $$
begin
  new.relationship_key := coalesce(new.company_id::text, 'none') || ':' || coalesce(new.person_id::text, 'none');
  return new;
end;
$$;

create trigger company_enrichments_touch_updated_at before update on public.company_enrichments for each row execute function public.touch_updated_at();
create trigger investment_relationships_touch_updated_at before update on public.investment_relationships for each row execute function public.touch_updated_at();
create trigger investment_deals_touch_updated_at before update on public.investment_deals for each row execute function public.touch_updated_at();
create trigger investment_relationships_set_key before insert or update on public.investment_relationships for each row execute function public.set_investment_relationship_key();

create index company_enrichments_status_idx on public.company_enrichments (organization_id, status);
create index company_enrichments_keywords_idx on public.company_enrichments using gin (keywords);
create index investment_relationships_org_company_idx on public.investment_relationships (organization_id, company_id) where company_id is not null;
create index investment_relationships_org_person_idx on public.investment_relationships (organization_id, person_id) where person_id is not null;
create index investment_relationships_org_status_idx on public.investment_relationships (organization_id, investment_status, capacity_status);
create index investment_deals_org_status_idx on public.investment_deals (organization_id, status, invested_at desc);
create index investment_deal_participants_relationship_idx on public.investment_deal_participants (organization_id, relationship_id);

alter table public.company_enrichments enable row level security;
alter table public.investment_relationships enable row level security;
alter table public.investment_deals enable row level security;
alter table public.investment_deal_participants enable row level security;

create policy company_enrichments_member_all on public.company_enrichments
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy investment_relationships_member_all on public.investment_relationships
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy investment_deals_member_all on public.investment_deals
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy investment_deal_participants_member_all on public.investment_deal_participants
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
