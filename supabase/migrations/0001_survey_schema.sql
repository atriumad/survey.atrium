create extension if not exists pgcrypto;

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  primary_color text,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  slug text not null,
  google_place_id text,
  created_at timestamptz not null default now(),
  unique (client_id, slug)
);

create index locations_client_id_idx on locations (client_id);

create table negative_keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  keyword text not null,
  created_at timestamptz not null default now()
);

create index negative_keywords_client_id_idx on negative_keywords (client_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  classification text not null check (classification in ('good', 'bad')),
  matched_keywords text[],
  shared_to_google boolean not null default false,
  created_at timestamptz not null default now()
);

create index reviews_client_id_idx on reviews (client_id);
create index reviews_location_id_idx on reviews (location_id);
create index reviews_created_at_idx on reviews (created_at desc);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  role text not null check (role in ('admin', 'manager')),
  location_id uuid references locations (id) on delete set null,
  created_at timestamptz not null default now()
);

create index profiles_client_id_idx on profiles (client_id);

-- Helper: current user's profile, used by RLS policies below.
create or replace function auth_profile()
returns table (client_id uuid, role text, location_id uuid)
language sql
security definer
stable
as $$
  select client_id, role, location_id from profiles where id = auth.uid();
$$;

alter table clients enable row level security;
alter table locations enable row level security;
alter table negative_keywords enable row level security;
alter table reviews enable row level security;
alter table profiles enable row level security;

-- Public (anon) needs to read client/location info to render the survey page.
create policy "anon can read clients" on clients for select to anon using (true);
create policy "anon can read locations" on locations for select to anon using (true);

-- Public (anon) needs to read negative keywords to classify a submitted review.
create policy "anon can read keywords" on negative_keywords for select to anon using (true);

-- Public (anon) can only insert reviews, never read/update/delete them.
create policy "anon can insert reviews" on reviews for insert to anon with check (true);

-- Authenticated users see only their own client's data.
create policy "authenticated read own client" on clients for select to authenticated
  using (id = (select client_id from auth_profile()));

create policy "authenticated read own client locations" on locations for select to authenticated
  using (client_id = (select client_id from auth_profile()));

create policy "admin manages locations" on locations for all to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (select role from auth_profile()) = 'admin'
  );

create policy "authenticated read own client keywords" on negative_keywords for select to authenticated
  using (client_id = (select client_id from auth_profile()));

create policy "admin manages keywords" on negative_keywords for all to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (select role from auth_profile()) = 'admin'
  );

-- Reviews: admin sees all reviews for their client; manager sees only their location's.
create policy "authenticated read own client reviews" on reviews for select to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (
      (select role from auth_profile()) = 'admin'
      or location_id = (select location_id from auth_profile())
    )
  );

create policy "authenticated read own profile" on profiles for select to authenticated
  using (id = auth.uid());

create policy "admin manages profiles" on profiles for all to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (select role from auth_profile()) = 'admin'
  );
