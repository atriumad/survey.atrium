-- 0011: Close the anonymous read leak.
--
-- 0001 let anon SELECT every row of clients, locations and negative_keywords,
-- which exposes every tenant's locations, review links and keywords to anyone
-- holding the public anon key. Public pages now use get_public_location()
-- (0010) and the submit_review() RPC evaluates keywords server-side.
--
-- APPLY ONLY AFTER the app version that calls get_public_location is
-- deployed, otherwise the old public pages return 404.

drop policy if exists "anon can read clients" on clients;
drop policy if exists "anon can read locations" on locations;
drop policy if exists "anon can read keywords" on negative_keywords;

-- Defense in depth: anon needs no direct table access at all.
revoke select on clients, locations, negative_keywords from anon;

-- Revert (manual):
--   create policy "anon can read clients" on clients for select to anon using (true);
--   create policy "anon can read locations" on locations for select to anon using (true);
--   create policy "anon can read keywords" on negative_keywords for select to anon using (true);
--   grant select on clients, locations, negative_keywords to anon;
