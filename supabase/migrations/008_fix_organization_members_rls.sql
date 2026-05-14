create or replace function public.can_manage_org_members(target_organization_id uuid)
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
      and member.role in ('owner', 'admin')
  );
$$;

drop policy if exists organization_members_admin_write on public.organization_members;

create policy organization_members_admin_insert on public.organization_members
  for insert
  with check (public.can_manage_org_members(organization_id));

create policy organization_members_admin_update on public.organization_members
  for update
  using (public.can_manage_org_members(organization_id))
  with check (public.can_manage_org_members(organization_id));

create policy organization_members_admin_delete on public.organization_members
  for delete
  using (public.can_manage_org_members(organization_id));
