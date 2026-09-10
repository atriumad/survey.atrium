-- Some hosted projects are missing the "anon can insert reviews" policy
-- (tables were created but one or more policies from 0001 were never applied).
-- Idempotent: recreates the policy only if it does not exist, so it is safe
-- to run against an up-to-date database too.
--
-- It also adds an insert policy for the authenticated role: when the reviewer
-- opens the survey from a browser that already has an admin session on the same
-- domain, the server-side Supabase client runs as "authenticated" (the admin's
-- JWT) and would otherwise hit RLS 42501 on insert, since 0001 only granted
-- SELECT to authenticated on reviews.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'anon can insert reviews'
  ) then
    create policy "anon can insert reviews" on reviews for insert to anon with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'authenticated can insert reviews'
  ) then
    create policy "authenticated can insert reviews" on reviews for insert to authenticated with check (true);
  end if;
end
$$;