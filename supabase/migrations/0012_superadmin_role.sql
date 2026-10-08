-- 0012: Superadmin role for Atrium staff.
--
-- A superadmin is a profiles row with role 'superadmin' and no client, and the
-- reverse holds too: every other role must have a client (two-way check
-- below). Tenant
-- RLS policies compare client_id to auth_profile().client_id, so a null
-- client_id matches nothing: a superadmin reads no tenant rows through RLS.
-- The admin panel uses the service-role client for cross-tenant work.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check check (role in ('superadmin', 'admin', 'manager'));

alter table profiles alter column client_id drop not null;
alter table profiles
  add constraint profiles_client_required check ((role = 'superadmin') = (client_id is null));

-- The 0001 policy "admin manages profiles" was FOR ALL with USING only, which
-- Postgres reuses as WITH CHECK for INSERT/UPDATE. It never constrained the
-- NEW row's role, so a tenant admin could PATCH a profile in their own client
-- to role 'superadmin'. Tenant admins do not manage profiles through
-- PostgREST (the superadmin panel uses the service role, which bypasses RLS),
-- so the policy is dropped. With no INSERT/UPDATE/DELETE policy left, writes
-- by authenticated users are denied. "authenticated read own profile" stays.
-- Revert (restores the escalation hole; do not do this):
--   create policy "admin manages profiles" on profiles for all to authenticated
--     using (client_id = (select client_id from auth_profile())
--            and (select role from auth_profile()) = 'admin');
drop policy if exists "admin manages profiles" on profiles;

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
