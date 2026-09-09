# QR fixed domain + scan tracking

## Context

QR generation already exists: creating a location in Config auto-renders a QR
(client-side, `lib/qr.ts` + `app/dashboard/(protected)/config/locations-section.tsx`)
encoding `window.location.origin + /r/<slug>`, with a download button. That flow
is good enough as-is. Two gaps remain:

1. The QR must always point at the production domain (`dcop.atriumad.com`),
   regardless of where in the app it's generated from.
2. There's no visibility into how many people scan the QR and land on the
   review page without submitting a review (needed to compute a conversion
   rate: reviews submitted / scans).

Single client today; multi-client/multi-domain is a future concern, not
addressed here (YAGNI).

## 1. Fixed domain for QR

- Add `NEXT_PUBLIC_SITE_URL=https://dcop.atriumad.com` to production env vars.
- `buildReviewUrl` callers use `process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin`
  so local dev (no env var set) keeps working against `localhost`.
- Vercel domain setup (Settings → Domains → add `dcop.atriumad.com`, then DNS
  record at the registrar) is an infra step done manually, not by this change.

## 2. QR scan tracking

### Schema

New table, migration `0003_qr_scans.sql`:

```sql
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

create policy "anon can insert qr scans" on qr_scans for insert to anon with check (true);

create policy "authenticated read own client qr scans" on qr_scans for select to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (
      (select role from auth_profile()) = 'admin'
      or location_id = (select location_id from auth_profile())
    )
  );
```

Mirrors the existing `reviews` RLS shape exactly (anon insert-only, admin sees
all, manager sees own location).

### Recording a scan

`app/r/[locationSlug]/page.tsx`: after resolving `location` (needs `client_id`
added to the existing select), insert one `qr_scans` row before rendering.
Wrapped so a failed insert never breaks the page (best-effort, same spirit as
the rest of the anon-facing flow).

### Dashboard display

`app/dashboard/(protected)/page.tsx` (Metricas): two more `MetricCard`s next
to the existing four —
- **Escaneos QR**: count of `qr_scans` rows for the client (respecting the
  same location filter/effective-location logic already used for reviews).
- **Conversión**: `reviews.total / scans * 100`, guarding div-by-zero.

No new page, no per-day breakdown UI — just totals, per the ask.

### Known limitation

Counts every GET to `/r/[locationSlug]`, including link-preview bot fetches
if the URL is ever shared as a text link instead of scanned. Not filtered —
out of scope unless it becomes a real problem.

## Testing

- Unit test for the conversion-rate calculation (guard divide-by-zero).
- Manual: scan flow smoke test — visit `/r/<slug>`, confirm a `qr_scans` row
  appears, confirm dashboard cards update.
