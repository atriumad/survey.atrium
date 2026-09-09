create table qr_scans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index qr_scans_client_id_idx on qr_scans (client_id);
create index qr_scans_location_id_idx on qr_scans (location_id);
create index qr_scans_created_at_idx on qr_scans (created_at desc);

alter table qr_scans enable row level security;

-- Public (anon) can only insert scan events, never read them.
create policy "anon can insert qr scans" on qr_scans for insert to anon with check (true);

-- Authenticated users see only their own client's scans (manager: own location only).
create policy "authenticated read own client qr scans" on qr_scans for select to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (
      (select role from auth_profile()) = 'admin'
      or location_id = (select location_id from auth_profile())
    )
  );
