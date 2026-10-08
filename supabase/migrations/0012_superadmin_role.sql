-- 0012: Superadmin role for Atrium staff.
--
-- A superadmin is a profiles row with role 'superadmin' and no client. Tenant
-- RLS policies compare client_id to auth_profile().client_id, so a null
-- client_id matches nothing: a superadmin reads no tenant rows through RLS.
-- The admin panel uses the service-role client for cross-tenant work.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check check (role in ('superadmin', 'admin', 'manager'));

alter table profiles alter column client_id drop not null;
alter table profiles
  add constraint profiles_client_required check (role = 'superadmin' or client_id is not null);

create or replace function is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'superadmin'
  );
$$;

revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;
