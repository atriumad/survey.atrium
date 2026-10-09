-- Tenant isolation assertions. Everything runs in one transaction and is
-- rolled back, so it leaves no data behind.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
-- Needs migrations 0001-0012 applied.

begin;

-- Fixtures (inserted as the connecting role, postgres, which has BYPASSRLS).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-admin-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'rls-manager-a1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'rls-admin-b@test.local', 'authenticated', 'authenticated')
  ,('00000000-0000-0000-0000-0000000000f1', 'rls-superadmin@test.local', 'authenticated', 'authenticated')
  ,('00000000-0000-0000-0000-0000000000f2', 'rls-fresh@test.local', 'authenticated', 'authenticated');

insert into public.clients (id, name, slug) values
  ('00000000-0000-0000-0000-00000000c001', 'RLS Client A', 'rls-client-a'),
  ('00000000-0000-0000-0000-00000000c002', 'RLS Client B', 'rls-client-b');

insert into public.locations (id, client_id, name, slug) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-00000000c001', 'A One', 'rls-a1'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-00000000c001', 'A Two', 'rls-a2'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-00000000c002', 'B One', 'rls-b1');

insert into public.profiles (id, client_id, role, location_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c001', 'admin', null),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000c001', 'manager', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000c002', 'admin', null);

insert into public.profiles (id, client_id, role, location_id) values
  ('00000000-0000-0000-0000-0000000000f1', null, 'superadmin', null);

insert into public.negative_keywords (client_id, keyword) values
  ('00000000-0000-0000-0000-00000000c001', 'rls-secret-a'),
  ('00000000-0000-0000-0000-00000000c002', 'rls-secret-b');

insert into public.reviews (client_id, location_id, rating, comment, classification) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000101', 5, 'a1 one', 'good'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000101', 2, 'a1 two', 'bad'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000102', 4, 'a2 one', 'good'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000103', 1, 'b1 one', 'bad');

-- anon: no table reads, only the RPC.
set local role anon;
do $$
begin
  -- 0011 revokes anon's SELECT on these tables, so a read raises 42501.
  -- That is the pass case. Any row returned is a leak and raises P0001,
  -- which the handler does not catch.
  begin
    if (select count(*) from public.clients) <> 0 then raise exception 'anon can read clients'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    if (select count(*) from public.locations) <> 0 then raise exception 'anon can read locations'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    if (select count(*) from public.negative_keywords) <> 0 then raise exception 'anon can read negative_keywords'; end if;
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.reviews) <> 0 then raise exception 'anon can read reviews'; end if;
  if (select count(*) from public.get_public_location('rls-a1')) <> 1 then raise exception 'rpc: known slug not found'; end if;
  if (select name from public.get_public_location('rls-a1')) <> 'A One' then raise exception 'rpc: wrong name'; end if;
  if (select count(*) from public.get_public_location('does-not-exist')) <> 0 then raise exception 'rpc: unknown slug returned rows'; end if;
end $$;
reset role;

-- admin of client A: sees only A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.clients) <> 1 then raise exception 'admin A: clients <> 1'; end if;
  if (select count(*) from public.locations) <> 2 then raise exception 'admin A: locations <> 2'; end if;
  if (select count(*) from public.negative_keywords) <> 1 then raise exception 'admin A: keywords <> 1'; end if;
  if (select count(*) from public.reviews) <> 3 then raise exception 'admin A: reviews <> 3'; end if;
  if exists (select 1 from public.locations where slug = 'rls-b1') then raise exception 'admin A sees B location'; end if;
end $$;

-- Admin A must not be able to promote anyone to superadmin. After 0012 drops
-- "admin manages profiles" there is no write policy, so an UPDATE touches 0
-- rows (no error) and an INSERT raises 42501. The two-way check constraint
-- (check_violation 23514) is a second barrier. Any of these outcomes passes;
-- success of the write does not.
do $$
declare
  n integer;
begin
  begin
    update public.profiles set role = 'superadmin'
      where id = '00000000-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'admin A promoted self to superadmin'; end if;
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    update public.profiles set role = 'superadmin'
      where id = '00000000-0000-0000-0000-0000000000a2';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'admin A promoted manager to superadmin'; end if;
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.profiles (id, client_id, role)
      values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c001', 'superadmin');
    raise exception 'admin A inserted a superadmin profile';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;
reset role;

-- Verify as the fixture owner that nothing changed.
do $$
begin
  if exists (select 1 from public.profiles where role = 'superadmin' and id <> '00000000-0000-0000-0000-0000000000f1') then
    raise exception 'unexpected superadmin profile exists after admin A writes';
  end if;
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') <> 'admin' then
    raise exception 'admin A role changed';
  end if;
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') <> 'manager' then
    raise exception 'manager A1 role changed';
  end if;
end $$;

-- manager of A1: only that location's reviews.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.reviews) <> 2 then raise exception 'manager A1: reviews <> 2'; end if;
  if exists (select 1 from public.reviews where location_id <> '00000000-0000-0000-0000-000000000101') then
    raise exception 'manager A1 sees another location';
  end if;
end $$;
reset role;

-- admin of client B: sees only B.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.locations) <> 1 then raise exception 'admin B: locations <> 1'; end if;
  if (select count(*) from public.reviews) <> 1 then raise exception 'admin B: reviews <> 1'; end if;
  if exists (select 1 from public.negative_keywords where keyword = 'rls-secret-a') then raise exception 'admin B sees A keywords'; end if;
end $$;
reset role;

-- superadmin: authenticated but sees no tenant rows through RLS.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.clients) <> 0 then raise exception 'superadmin reads clients via RLS'; end if;
  if (select count(*) from public.locations) <> 0 then raise exception 'superadmin reads locations via RLS'; end if;
  if (select count(*) from public.reviews) <> 0 then raise exception 'superadmin reads reviews via RLS'; end if;
  if not public.is_superadmin() then raise exception 'is_superadmin() false for superadmin'; end if;
end $$;
reset role;

select 'RLS isolation: all assertions passed' as result;
rollback;
