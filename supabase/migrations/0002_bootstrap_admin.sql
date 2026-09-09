-- Bootstrap first client + admin profile so the dashboard is reachable.
-- Runs as the migration role (bypasses RLS), sidestepping the chicken-and-egg
-- problem where creating a profile requires an existing admin profile.
-- Edit name/slug/email below before applying if they don't match.

insert into clients (name, slug)
values ('TBS Advertising', 'tbs-advertising')
on conflict (slug) do nothing;

insert into profiles (id, client_id, role)
select u.id, c.id, 'admin'
from auth.users u
cross join clients c
where u.email = 'dev@tbsadvertising.com'
  and c.slug = 'tbs-advertising'
on conflict (id) do nothing;
