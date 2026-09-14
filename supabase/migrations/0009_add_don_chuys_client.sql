-- Add "Don Chuys" client + default admin profile.
-- Prereq: create the auth user first in Supabase Dashboard
-- (Authentication > Users > Add user), email: donchuys@login.local,
-- set a password there. Then run this migration.

insert into clients (name, slug)
values ('Don Chuys', 'don-chuys')
on conflict (slug) do nothing;

insert into profiles (id, client_id, role)
select u.id, c.id, 'admin'
from auth.users u
cross join clients c
where u.email = 'donchuys@login.local'
  and c.slug = 'don-chuys'
on conflict (id) do nothing;
