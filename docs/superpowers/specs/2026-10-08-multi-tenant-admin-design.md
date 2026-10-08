# Multi-tenant hardening + Atrium superadmin panel

Date: 2026-10-08
Status: draft, pending user review

## Goal

The system will serve many clients, each with many locations. Today the schema
and dashboard isolate tenants correctly, but (1) public anon policies leak
every tenant's data, (2) onboarding a client needs hand-written SQL, and
(3) location slugs collide across clients. Atrium staff (only) must be able to
onboard and manage tenants from a panel, without breaking existing public
survey URLs or printed QR codes.

## Decisions (agreed with user)

- Operator: **Atrium only** (a `superadmin` role). Clients never create tenants.
- Approach A: superadmin lives in the same app/`profiles` table, panel at
  `/dashboard/admin`.
- Delivery order: 1) RLS hardening, 2) superadmin + panel, 3) slug handling.

## Non-goals

- Client self-service for creating locations/managers (admins keep today's
  location and keyword management only).
- Multi-client membership for one user (still one profile per user).
- Changing the survey UX or the `/r/[locationSlug]` URL shape.

## Part 1: RLS hardening

### Problem
`0001` grants `anon` `select using (true)` on `clients`, `locations`,
`negative_keywords`. Anyone with the public anon key can list every tenant,
its locations/slugs/review URLs and its negative keywords.

### Change (migration `0010`)
- Add `get_public_location(p_slug text)` RPC, `security definer`,
  `set search_path = ''`, returning only `id, name` (what `/r/[locationSlug]`
  renders and what `record_qr_scan` needs). `grant execute` to `anon`.
- Drop the three `anon can read ...` policies.
- `/r/[locationSlug]/page.tsx` calls the RPC instead of
  `from("locations")`.
- Review submit and QR scan already go through `security definer` RPCs; no
  change. Keywords are evaluated inside the submit RPC, so they stay private.

### Verify before dropping
Grep every anon read of those tables (`app/r/**`, `lib/**`). Only
`app/r/[locationSlug]/page.tsx` reads `locations` as anon today; confirm
nothing else does, including the thank-you page `/r/[locationSlug]/t`.

### Tests
RLS isolation test with 2 clients x 2 locations (see Testing).

## Part 2: Superadmin role and panel

### Schema (migration `0011`)
- `profiles.role` check becomes `('superadmin','admin','manager')`.
- `profiles.client_id` becomes nullable, with check:
  `role = 'superadmin' or client_id is not null`.
- `auth_profile()` unchanged in shape; for superadmin `client_id` is null, so
  existing tenant policies (`client_id = ...`) match nothing. Superadmin never
  reads tenant data through RLS; the panel uses the service-role client.
- Add `is_superadmin()` helper (`security definer`, locked search_path) for
  any future policy.

### Service role
- New env var `SUPABASE_SERVICE_ROLE_KEY`, server-only. A `lib/supabase/admin.ts`
  creates the client and starts with `import "server-only"` so a client bundle
  import fails at build time.
- Every panel server action first runs `requireSuperadmin()` (mirrors the
  existing `requireAdmin()` in `config/actions.ts`). The service-role client
  bypasses RLS, so this check is the only gate and must be the first line of
  every action.

### Panel (`/dashboard/admin`)
Visible and routable only for `role === 'superadmin'`; sidebar shows the entry
only for that role; layout redirects others.
- Clients list + create (name, slug).
- Client detail: locations (create/delete), users (create admin or manager,
  manager picks a location), reset password, delete user.
- User creation: `auth.admin.createUser` (email, password, email confirmed),
  then insert `profiles` row. If the profile insert fails, delete the auth user
  (no orphans). Password is generated server-side and shown once.
- Generated emails default to `<slug>@login.local` pattern but are editable.

### Dashboard behavior for superadmin
`getProfile()` returns `clientId: string | null`. Tenant pages
(`page.tsx`, `reviews`, `config`) require a non-null `clientId`; a superadmin
landing there is redirected to `/dashboard/admin`. `Role` type gains
`'superadmin'`.

### Bootstrap
First superadmin created by one-off SQL, same style as `0002`. Documented in
README. Not auto-seeded.

## Part 3: Slugs

`locations_slug_key` is globally unique (needed for public lookup). Keep it.
- Panel suggests slug `<client-slug>-<location-slug>` by default.
- Collision returns a clear message ("slug already used") instead of a raw
  Postgres error, in both the panel and the existing `config/actions.ts`
  (catch code `23505`).
- Existing slugs and printed QR codes are untouched.

## Testing

- Unit: `requireSuperadmin` rejects admin/manager/anon; slug collision message;
  user-creation rollback on profile failure (mock service client).
- RLS integration (local Supabase or SQL test): with clients A and B and
  locations A1, A2, B1:
  - anon cannot select `clients`, `locations`, `negative_keywords`.
  - anon `get_public_location('a1')` returns only `id, name`.
  - admin A sees only A's reviews/locations/keywords; none of B's.
  - manager A1 sees only A1 reviews.
  - superadmin through RLS sees no tenant rows.
- Manual: existing QR URL still renders; submit review still works.

## Rollout

1. Deploy code that calls `get_public_location` together with migration
   `0010` (RPC must exist before the page uses it; drop the anon policies in
   the same migration, after the RPC is created).
2. Migration `0011`, set `SUPABASE_SERVICE_ROLE_KEY` in Vercel, create first
   superadmin by SQL, then use the panel.
3. Rollback: `0010` keeps policies in a commented revert block; `0011` is
   additive (role check widened, column nullable).

## Open risks

- Service-role key leak = full DB access. Mitigation: `server-only`, never
  `NEXT_PUBLIC_`, Vercel env scoped to server.
- Dropping anon policies breaks any anon read I fail to find; covered by the
  "verify before dropping" grep and manual QR test.
