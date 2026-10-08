# Multi-tenant hardening + superadmin panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop anonymous users from reading every tenant's data, and let Atrium staff onboard clients, locations and users from a superadmin panel.

**Architecture:** Public pages read location data through a `security definer` RPC instead of table policies; the anon `select` policies are then dropped. A new `superadmin` role (a `profiles` row with null `client_id`) unlocks `/dashboard/admin`, whose server actions use the service-role client behind a `requireSuperadmin()` guard. Existing tenant pages keep working through a `getTenantProfile()` helper that redirects superadmins to the panel.

**Tech Stack:** Next.js 16 (App Router, server actions, React 19 `useActionState`), Supabase (Postgres RLS, `@supabase/ssr`, `@supabase/supabase-js`), Zod 4, Vitest 5, Bun (`bun.lock`).

**Spec:** `docs/superpowers/specs/2026-10-08-multi-tenant-admin-design.md`

## Global Constraints

- Public URL shape stays `/r/[locationSlug]` and `/r/[locationSlug]/t`; printed QR codes must keep working.
- `locations.slug` stays globally unique (`locations_slug_key`).
- `SUPABASE_SERVICE_ROLE_KEY` is server-only: never prefixed `NEXT_PUBLIC_`, and `lib/supabase/admin.ts` starts with `import "server-only"`.
- Every superadmin server action calls `requireSuperadmin()` as its first statement.
- One profile per user (`profiles.id` is the PK); one client per user.
- `security definer` functions use `set search_path = ''` and fully-qualified `public.` names (same as migration `0006`).
- Migrations are numbered `0010`, `0011`, `0012`; do not edit existing migrations.
- Tests run with `npm test` (vitest, node env, `@` alias maps to repo root). Typecheck with `npx tsc --noEmit`, lint with `npm run lint`.
- Commit messages end with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Manager created with a location that belongs to another client must be rejected before any auth user exists (Task 5).
- Profile insert failing after the auth user was created must delete that auth user, leaving no orphan login (Task 5).
- A superadmin opening `/dashboard`, `/dashboard/reviews` or `/dashboard/config` must be redirected to `/dashboard/admin`, not crash on a null `clientId` (Task 3).
- A non-superadmin calling any panel action must get `Forbidden` before the service-role client is created (Task 5).
- Resetting the password of, or deleting, a superadmin account through the panel must be refused (Task 5).
- Unknown location slug on the public page must 404, not 500, after the switch to the RPC (Task 1, manual check).
- Duplicate slug (same or another client) must show a readable message, not a raw Postgres error (Tasks 4 and 7).

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0010_get_public_location.sql` | RPC for public location lookup (additive) |
| `supabase/migrations/0011_drop_anon_read_policies.sql` | Remove anon reads on clients/locations/negative_keywords |
| `supabase/migrations/0012_superadmin_role.sql` | `superadmin` role, nullable `client_id`, `is_superadmin()` |
| `supabase/tests/rls_isolation.sql` | Rolled-back SQL assertions for tenant isolation |
| `lib/get-profile.ts` | `Profile` union, `getProfile()`, `getTenantProfile()` |
| `lib/supabase/admin.ts` | Service-role client (server-only) |
| `lib/superadmin.ts` | `requireSuperadmin()` |
| `lib/passwords.ts` | `generatePassword()` |
| `lib/db-errors.ts` | `describeDbError()` |
| `lib/action-result.ts` | `ActionResult<T>` type |
| `lib/validation.ts` | New schemas: client, admin location, user, user id |
| `app/dashboard/(protected)/admin/**` | Panel layout, pages, forms, server actions |

---

### Task 1: Public location RPC and switch the public pages to it

**Files:**
- Create: `supabase/migrations/0010_get_public_location.sql`
- Modify: `app/r/[locationSlug]/page.tsx:13-26`
- Modify: `app/r/[locationSlug]/t/page.tsx:20-25`

**Interfaces:**
- Produces: SQL function `public.get_public_location(p_slug text)` returning `table (id uuid, name text, google_review_url text)`, executable by `anon, authenticated`. Used by Task 2's SQL test.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_get_public_location.sql`:

```sql
-- 0010: Public location lookup via RPC.
--
-- The public survey and thank-you pages only need a location's id, name and
-- Google review link. Expose exactly that through a SECURITY DEFINER function
-- so the wide-open anon SELECT policies can be dropped (migration 0011).
-- Additive and safe to apply before the matching app deploy.

create or replace function get_public_location(p_slug text)
returns table (id uuid, name text, google_review_url text)
language sql
security definer
stable
set search_path = ''
as $$
  select l.id, l.name, l.google_review_url
  from public.locations l
  where l.slug = p_slug
  limit 1;
$$;

revoke all on function public.get_public_location(text) from public;
grant execute on function public.get_public_location(text) to anon, authenticated;
```

- [ ] **Step 2: Switch the survey page to the RPC**

In `app/r/[locationSlug]/page.tsx`, replace the lookup:

```tsx
  const { data: location, error } = await supabase
    .from("locations")
    .select("id, name, client_id")
    .eq("slug", locationSlug)
    .single();
```

with:

```tsx
  const { data: location, error } = await supabase
    .rpc("get_public_location", { p_slug: locationSlug })
    .single();
```

Leave the `if (error || !location)` block unchanged: a zero-row result still yields error code `PGRST116`, which maps to `notFound()`.

- [ ] **Step 3: Switch the thank-you page to the RPC**

In `app/r/[locationSlug]/t/page.tsx`, replace:

```tsx
      supabase.from("locations").select("google_review_url").eq("slug", locationSlug).single(),
```

with:

```tsx
      supabase.rpc("get_public_location", { p_slug: locationSlug }).maybeSingle(),
```

`locationResult.data?.google_review_url ?? null` below it already works with the RPC row shape.

- [ ] **Step 4: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, 52 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0010_get_public_location.sql "app/r/[locationSlug]/page.tsx" "app/r/[locationSlug]/t/page.tsx"
git commit -m "feat: read public location data through get_public_location RPC

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Drop anon read policies and add the SQL isolation test

**Files:**
- Create: `supabase/migrations/0011_drop_anon_read_policies.sql`
- Create: `supabase/tests/rls_isolation.sql`

**Interfaces:**
- Consumes: `public.get_public_location(text)` from Task 1.
- Produces: `supabase/tests/rls_isolation.sql`, extended in Task 3.

- [ ] **Step 1: Write the SQL test (it fails against a database that still has the anon policies)**

Create `supabase/tests/rls_isolation.sql`:

```sql
-- Tenant isolation assertions. Everything runs in one transaction and is
-- rolled back, so it leaves no data behind.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
-- Needs migrations 0001-0011 applied.

begin;

-- Fixtures (inserted as the connecting superuser, which bypasses RLS).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-admin-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'rls-manager-a1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'rls-admin-b@test.local', 'authenticated', 'authenticated');

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
  if (select count(*) from public.clients) <> 0 then raise exception 'anon can read clients'; end if;
  if (select count(*) from public.locations) <> 0 then raise exception 'anon can read locations'; end if;
  if (select count(*) from public.negative_keywords) <> 0 then raise exception 'anon can read negative_keywords'; end if;
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
reset role;

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

select 'RLS isolation: all assertions passed' as result;
rollback;
```

- [ ] **Step 2: Run the test to verify it fails (anon policies still exist)**

Run: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql`
(`SUPABASE_DB_URL` is the connection string from Supabase Dashboard > Project Settings > Database. Use a non-production project if one exists; the script rolls back either way.)
Expected: FAIL with `ERROR:  anon can read clients`. This requires `0010` already applied.

- [ ] **Step 3: Write the migration that fixes it**

Create `supabase/migrations/0011_drop_anon_read_policies.sql`:

```sql
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
```

- [ ] **Step 4: Apply 0011 and run the test to verify it passes**

Apply `0011` to the same database (Supabase SQL editor or `psql -f`), then re-run the command from Step 2.
Expected: output `RLS isolation: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_drop_anon_read_policies.sql supabase/tests/rls_isolation.sql
git commit -m "fix: drop anon read policies on clients, locations and keywords

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Superadmin role in the schema and a null-safe profile

**Files:**
- Create: `supabase/migrations/0012_superadmin_role.sql`
- Modify: `supabase/tests/rls_isolation.sql`
- Modify: `lib/types.ts:3`
- Modify: `lib/get-profile.ts` (whole file)
- Modify: `app/dashboard/(protected)/page.tsx:27-28`
- Modify: `app/dashboard/(protected)/reviews/page.tsx:23-24`
- Modify: `app/dashboard/(protected)/config/page.tsx:9-10`
- Modify: `app/dashboard/(protected)/reviews/actions.ts:17-18`
- Test: `tests/get-profile.test.ts`

**Interfaces:**
- Produces:
  - `type Profile = { role: "superadmin"; clientId: null; locationId: null } | { role: "admin" | "manager"; clientId: string; locationId: string | null }`
  - `type TenantProfile = Extract<Profile, { clientId: string }>`
  - `getProfile(): Promise<Profile | null>`
  - `getTenantProfile(): Promise<TenantProfile | null>` (redirects superadmin to `/dashboard/admin`)
  - `Role = "superadmin" | "admin" | "manager"`
  - SQL: `public.is_superadmin()` returns boolean.

- [ ] **Step 1: Write the failing test**

Create `tests/get-profile.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getProfile, getTenantProfile } from "@/lib/get-profile";

function mockProfileRow(row: { client_id: string | null; role: string; location_id: string | null } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }) }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe("getProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a tenant row to camelCase", async () => {
    mockProfileRow({ client_id: "c1", role: "manager", location_id: "l1" });
    expect(await getProfile()).toEqual({ clientId: "c1", role: "manager", locationId: "l1" });
  });

  it("returns a superadmin with null client and location", async () => {
    mockProfileRow({ client_id: null, role: "superadmin", location_id: null });
    expect(await getProfile()).toEqual({ clientId: null, role: "superadmin", locationId: null });
  });

  it("returns null when there is no profile row", async () => {
    mockProfileRow(null);
    expect(await getProfile()).toBeNull();
  });
});

describe("getTenantProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects a superadmin to the admin panel", async () => {
    mockProfileRow({ client_id: null, role: "superadmin", location_id: null });
    await expect(getTenantProfile()).rejects.toThrow("REDIRECT:/dashboard/admin");
  });

  it("returns the profile for tenant users", async () => {
    mockProfileRow({ client_id: "c1", role: "admin", location_id: null });
    expect(await getTenantProfile()).toEqual({ clientId: "c1", role: "admin", locationId: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/get-profile.test.ts`
Expected: FAIL (`getTenantProfile` is not exported).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0012_superadmin_role.sql`:

```sql
-- 0012: Superadmin role for Atrium staff.
--
-- A superadmin is a profiles row with role 'superadmin' and no client. Tenant
-- RLS policies compare client_id to auth_profile().client_id, so a null
-- client_id matches nothing: a superadmin reads no tenant rows through RLS.
-- The admin panel uses the service-role client for cross-tenant work.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check check (role in ('superadmin', 'admin', 'manager'));

alter table profiles alter column client_id drop not null;
alter table profiles
  add constraint profiles_client_required check (role = 'superadmin' or client_id is not null);

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
```

- [ ] **Step 4: Extend the SQL test with a superadmin check**

In `supabase/tests/rls_isolation.sql`, add this auth user to the `insert into auth.users` list (change the final `;` of the list accordingly):

```sql
  ,('00000000-0000-0000-0000-0000000000f1', 'rls-superadmin@test.local', 'authenticated', 'authenticated')
```

Add after the `insert into public.profiles ... ;` statement:

```sql
insert into public.profiles (id, client_id, role, location_id) values
  ('00000000-0000-0000-0000-0000000000f1', null, 'superadmin', null);
```

Add before the final `select 'RLS isolation: all assertions passed'`:

```sql
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
```

Apply `0012`, then run `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql`.
Expected: `RLS isolation: all assertions passed`.

- [ ] **Step 5: Update `Role`**

In `lib/types.ts` replace line 3:

```ts
export type Role = "superadmin" | "admin" | "manager";
```

- [ ] **Step 6: Rewrite `lib/get-profile.ts`**

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export type Profile =
  | { role: Extract<Role, "superadmin">; clientId: null; locationId: null }
  | { role: Exclude<Role, "superadmin">; clientId: string; locationId: string | null };

export type TenantProfile = Extract<Profile, { clientId: string }>;

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("client_id, role, location_id")
    .eq("id", user.id)
    .single();

  if (!data) return null;

  if (data.role === "superadmin") {
    return { role: "superadmin", clientId: null, locationId: null };
  }

  return { role: data.role as TenantProfile["role"], clientId: data.client_id, locationId: data.location_id };
}

// For pages and actions that only make sense inside one tenant. Superadmins
// have no client, so they are sent to the admin panel instead.
export async function getTenantProfile(): Promise<TenantProfile | null> {
  const profile = await getProfile();
  if (!profile) return null;
  if (profile.role === "superadmin") redirect("/dashboard/admin");
  return profile;
}
```

- [ ] **Step 7: Move tenant pages to `getTenantProfile`**

In each of `app/dashboard/(protected)/page.tsx`, `reviews/page.tsx` and `config/page.tsx`, change the import `getProfile` to `getTenantProfile` and the call `await getProfile()` to `await getTenantProfile()` (the surrounding `if (!profile) return null;` / `redirect` lines stay as they are).

In `reviews/actions.ts` (a server action, where a redirect makes no sense) keep `getProfile` and change the guard:

```ts
  const profile = await getProfile();
  if (!profile || profile.role === "superadmin") return { csv: "", filename: "" };
```

`config/actions.ts` needs no change: `requireAdmin()` already throws unless `role === "admin"`, which narrows to a non-null `clientId`.

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass (57 total), no type errors. If `tsc` flags another `profile.clientId` use, narrow it the same way (switch that file to `getTenantProfile`).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0012_superadmin_role.sql supabase/tests/rls_isolation.sql lib/types.ts lib/get-profile.ts tests/get-profile.test.ts "app/dashboard/(protected)"
git commit -m "feat: add superadmin role and null-safe tenant profile

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Admin foundation (service client, guard, passwords, errors, schemas)

**Files:**
- Modify: `package.json` / `bun.lock` (add `server-only`)
- Create: `lib/supabase/admin.ts`
- Create: `lib/superadmin.ts`
- Create: `lib/passwords.ts`
- Create: `lib/db-errors.ts`
- Create: `lib/action-result.ts`
- Modify: `lib/validation.ts`
- Test: `tests/passwords.test.ts`, `tests/db-errors.test.ts`, `tests/superadmin.test.ts`, `tests/validation.test.ts` (append)

**Interfaces:**
- Consumes: `getProfile()` from Task 3.
- Produces:
  - `createAdminClient(): SupabaseClient` (service role, server-only)
  - `requireSuperadmin(): Promise<Profile>`; throws `Error("Forbidden")`
  - `generatePassword(length?: number): string`
  - `describeDbError(error: { code?: string; message: string }, fallback: string): string`
  - `type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string }`
  - Zod: `clientFormSchema`, `adminLocationFormSchema`, `userFormSchema`, `userIdSchema`

- [ ] **Step 1: Install `server-only`**

Run: `bun add server-only`
Expected: `package.json` lists `server-only` under dependencies.

- [ ] **Step 2: Write failing tests**

Create `tests/passwords.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generatePassword } from "@/lib/passwords";

describe("generatePassword", () => {
  it("defaults to 16 characters", () => {
    expect(generatePassword()).toHaveLength(16);
  });

  it("honors a custom length", () => {
    expect(generatePassword(24)).toHaveLength(24);
  });

  it("avoids ambiguous characters", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/);
    }
  });

  it("does not repeat", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
```

Create `tests/db-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeDbError } from "@/lib/db-errors";

describe("describeDbError", () => {
  it("explains a duplicate slug", () => {
    expect(
      describeDbError(
        { code: "23505", message: 'duplicate key value violates unique constraint "locations_slug_key"' },
        "Could not save"
      )
    ).toBe("That slug is already in use. Choose a different one.");
  });

  it("explains other duplicates", () => {
    expect(describeDbError({ code: "23505", message: "duplicate key ... profiles_pkey" }, "Could not save")).toBe(
      "That record already exists."
    );
  });

  it("explains a missing related record", () => {
    expect(describeDbError({ code: "23503", message: "violates foreign key" }, "Could not save")).toBe(
      "A related record was not found."
    );
  });

  it("falls back for unknown errors without leaking the message", () => {
    expect(describeDbError({ code: "XX000", message: "secret internals" }, "Could not save")).toBe("Could not save");
  });
});
```

Create `tests/superadmin.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/get-profile", () => ({ getProfile: vi.fn() }));

import { getProfile } from "@/lib/get-profile";
import { requireSuperadmin } from "@/lib/superadmin";

describe("requireSuperadmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects anonymous callers", async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    await expect(requireSuperadmin()).rejects.toThrow("Forbidden");
  });

  it("rejects client admins", async () => {
    vi.mocked(getProfile).mockResolvedValue({ role: "admin", clientId: "c1", locationId: null });
    await expect(requireSuperadmin()).rejects.toThrow("Forbidden");
  });

  it("rejects managers", async () => {
    vi.mocked(getProfile).mockResolvedValue({ role: "manager", clientId: "c1", locationId: "l1" });
    await expect(requireSuperadmin()).rejects.toThrow("Forbidden");
  });

  it("accepts a superadmin", async () => {
    const profile = { role: "superadmin" as const, clientId: null, locationId: null };
    vi.mocked(getProfile).mockResolvedValue(profile);
    await expect(requireSuperadmin()).resolves.toEqual(profile);
  });
});
```

Append to `tests/validation.test.ts` (add `clientFormSchema, userFormSchema` to its existing import from `@/lib/validation`; if the file imports other names, keep them):

```ts
describe("clientFormSchema", () => {
  it("lowercases the slug", () => {
    const r = clientFormSchema.parse({ name: " Don Chuys ", slug: "Don-Chuys" });
    expect(r).toEqual({ name: "Don Chuys", slug: "don-chuys" });
  });

  it("rejects slugs with spaces", () => {
    expect(clientFormSchema.safeParse({ name: "X", slug: "bad slug" }).success).toBe(false);
  });
});

describe("userFormSchema", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  const locationId = "22222222-2222-4222-8222-222222222222";

  it("accepts an admin without a location", () => {
    const r = userFormSchema.parse({ clientId, email: "A@B.com", role: "admin", locationId: "" });
    expect(r.email).toBe("a@b.com");
    expect(r.locationId).toBeNull();
  });

  it("requires a location for managers", () => {
    expect(userFormSchema.safeParse({ clientId, email: "a@b.com", role: "manager", locationId: "" }).success).toBe(false);
  });

  it("accepts a manager with a location", () => {
    expect(userFormSchema.safeParse({ clientId, email: "a@b.com", role: "manager", locationId }).success).toBe(true);
  });

  it("rejects the superadmin role", () => {
    expect(userFormSchema.safeParse({ clientId, email: "a@b.com", role: "superadmin", locationId: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: FAIL (modules and exports do not exist yet).

- [ ] **Step 4: Implement**

`lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Only call it from code that has already
// run requireSuperadmin().
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

`lib/superadmin.ts`:

```ts
import { getProfile } from "@/lib/get-profile";

export async function requireSuperadmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "superadmin") throw new Error("Forbidden");
  return profile;
}
```

`lib/passwords.ts`:

```ts
import { randomInt } from "node:crypto";

// No 0/O/1/l/I so a password read off a screen is hard to mistype.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generatePassword(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
```

`lib/db-errors.ts`:

```ts
export function describeDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") {
    return error.message.includes("slug")
      ? "That slug is already in use. Choose a different one."
      : "That record already exists.";
  }
  if (error.code === "23503") return "A related record was not found.";
  return fallback;
}
```

`lib/action-result.ts`:

```ts
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };
```

In `lib/validation.ts`, extract the slug field and add the new schemas. Replace the `slug: z.string()...transform(...)` block inside `locationFormSchema` with `slug: slugField`, and define above it:

```ts
const slugField = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/i, "Slug can only contain letters, numbers, and dashes")
  .transform((v) => v.toLowerCase());
```

Append at the end of the file:

```ts
export const clientFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugField,
});

export const adminLocationFormSchema = locationFormSchema.extend({
  clientId: z.uuid(),
});

export const userFormSchema = z
  .object({
    clientId: z.uuid(),
    email: z.email("Invalid email address").transform((v) => v.toLowerCase()),
    role: z.enum(["admin", "manager"]),
    locationId: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((v) => v || null),
  })
  .refine((d) => d.role !== "manager" || d.locationId !== null, {
    message: "Managers need a location",
    path: ["locationId"],
  });

export const userIdSchema = z.object({ userId: z.uuid() });
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock lib tests
git commit -m "feat: add admin client, superadmin guard, password and error helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Superadmin server actions

**Files:**
- Create: `app/dashboard/(protected)/admin/actions.ts`
- Test: `tests/admin-actions.test.ts`

**Interfaces:**
- Consumes: `requireSuperadmin`, `createAdminClient`, `generatePassword`, `describeDbError`, `ActionResult`, schemas from Task 4.
- Produces (all server actions):
  - `createClientAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult>`
  - `createLocationAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult>` (fields `clientId, name, slug, googleReviewUrl`)
  - `createUserAction(prev: ActionResult<{ email: string; password: string }> | null, formData: FormData): Promise<ActionResult<{ email: string; password: string }>>` (fields `clientId, email, role, locationId`)
  - `resetPasswordAction(prev: ActionResult<{ password: string }> | null, formData: FormData): Promise<ActionResult<{ password: string }>>` (field `userId`)
  - `deleteUserAction(formData: FormData): Promise<void>` (field `userId`)
  - `deleteLocationAction(formData: FormData): Promise<void>` (field `locationId`)

- [ ] **Step 1: Write failing tests**

Create `tests/admin-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/superadmin", () => ({ requireSuperadmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createClientAction,
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
} from "@/app/dashboard/(protected)/admin/actions";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function fd(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

type Chain = { eq: () => Chain; maybeSingle: () => Promise<{ data: unknown }> };
type DbError = { code: string; message: string } | null;

function fakeAdmin(opts: { location?: { id: string } | null; targetRole?: string | null; profileError?: DbError; clientError?: DbError } = {}) {
  const createUser = vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null }));
  const deleteUser = vi.fn(async () => ({ error: null }));
  const updateUserById = vi.fn(async () => ({ error: null }));
  const inserts: Record<string, unknown[]> = {};

  const from = vi.fn((table: string) => ({
    insert: vi.fn(async (row: unknown) => {
      (inserts[table] ??= []).push(row);
      const error = table === "profiles" ? opts.profileError : table === "clients" ? opts.clientError : null;
      return { error: error ?? null };
    }),
    select: vi.fn(() => {
      const data =
        table === "locations" ? (opts.location ?? null) : table === "profiles" && opts.targetRole ? { role: opts.targetRole } : null;
      const chain: Chain = { eq: () => chain, maybeSingle: async () => ({ data }) };
      return chain;
    }),
  }));

  const client = { from, auth: { admin: { createUser, deleteUser, updateUserById } } };
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
  return { createUser, deleteUser, updateUserById, inserts };
}

describe("superadmin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperadmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireSuperadmin>>);
  });

  it("refuses non-superadmins before touching the database", async () => {
    vi.mocked(requireSuperadmin).mockRejectedValue(new Error("Forbidden"));
    await expect(
      createUserAction(null, fd({ clientId: CLIENT_ID, email: "a@b.com", role: "admin", locationId: "" }))
    ).rejects.toThrow("Forbidden");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("creates an admin user and returns the generated password once", async () => {
    const admin = fakeAdmin();
    const result = await createUserAction(
      null,
      fd({ clientId: CLIENT_ID, email: "Owner@Client.com", role: "admin", locationId: "" })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.email).toBe("owner@client.com");
    expect(result.data.password).toHaveLength(16);
    expect(admin.createUser).toHaveBeenCalledWith({
      email: "owner@client.com",
      password: result.data.password,
      email_confirm: true,
    });
    expect(admin.inserts.profiles).toEqual([
      { id: USER_ID, client_id: CLIENT_ID, role: "admin", location_id: null },
    ]);
  });

  it("rejects a manager whose location belongs to another client, creating nothing", async () => {
    const admin = fakeAdmin({ location: null });
    const result = await createUserAction(
      null,
      fd({ clientId: CLIENT_ID, email: "m@client.com", role: "manager", locationId: LOCATION_ID })
    );
    expect(result).toEqual({ ok: false, error: "Location does not belong to this client." });
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it("deletes the auth user when the profile insert fails", async () => {
    const admin = fakeAdmin({ profileError: { code: "23503", message: "fk" } });
    const result = await createUserAction(
      null,
      fd({ clientId: CLIENT_ID, email: "a@b.com", role: "admin", locationId: "" })
    );
    expect(result.ok).toBe(false);
    expect(admin.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("maps a duplicate client slug to a readable message", async () => {
    fakeAdmin({ clientError: { code: "23505", message: 'duplicate key "clients_slug_key"' } });
    const result = await createClientAction(null, fd({ name: "Don Chuys", slug: "don-chuys" }));
    expect(result).toEqual({ ok: false, error: "That slug is already in use. Choose a different one." });
  });

  it("refuses to reset a superadmin password", async () => {
    const admin = fakeAdmin({ targetRole: "superadmin" });
    const result = await resetPasswordAction(null, fd({ userId: USER_ID }));
    expect(result).toEqual({ ok: false, error: "User not found." });
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it("resets a tenant user's password", async () => {
    const admin = fakeAdmin({ targetRole: "admin" });
    const result = await resetPasswordAction(null, fd({ userId: USER_ID }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(admin.updateUserById).toHaveBeenCalledWith(USER_ID, { password: result.data.password });
  });

  it("refuses to delete a superadmin", async () => {
    const admin = fakeAdmin({ targetRole: "superadmin" });
    await expect(deleteUserAction(fd({ userId: USER_ID }))).rejects.toThrow("User not found.");
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/admin-actions.test.ts`
Expected: FAIL (cannot resolve the actions module).

- [ ] **Step 3: Implement the actions**

Create `app/dashboard/(protected)/admin/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { generatePassword } from "@/lib/passwords";
import { describeDbError } from "@/lib/db-errors";
import type { ActionResult } from "@/lib/action-result";
import {
  adminLocationFormSchema,
  clientFormSchema,
  userFormSchema,
  userIdSchema,
} from "@/lib/validation";

const ADMIN_PATH = "/dashboard/admin";

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export async function createClientAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = clientFormSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid client.");

  const admin = createAdminClient();
  const { error } = await admin.from("clients").insert(parsed.data);
  if (error) return fail(describeDbError(error, "Could not create client."));

  revalidatePath(ADMIN_PATH);
  return { ok: true, data: null };
}

export async function createLocationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = adminLocationFormSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    googleReviewUrl: formData.get("googleReviewUrl") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid location.");

  const { clientId, name, slug, googleReviewUrl } = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin.from("locations").insert({
    client_id: clientId,
    name,
    slug,
    google_review_url: googleReviewUrl,
  });
  if (error) return fail(describeDbError(error, "Could not create location."));

  revalidatePath(`${ADMIN_PATH}/${clientId}`);
  return { ok: true, data: null };
}

export async function createUserAction(
  _prev: ActionResult<{ email: string; password: string }> | null,
  formData: FormData
): Promise<ActionResult<{ email: string; password: string }>> {
  await requireSuperadmin();
  const parsed = userFormSchema.safeParse({
    clientId: formData.get("clientId"),
    email: formData.get("email"),
    role: formData.get("role"),
    locationId: formData.get("locationId") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid user.");

  const { clientId, email, role, locationId } = parsed.data;
  const admin = createAdminClient();

  if (role === "manager") {
    const { data: location } = await admin
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!location) return fail("Location does not belong to this client.");
  }

  const password = generatePassword();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !created.user) return fail(authError?.message ?? "Could not create user.");

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    client_id: clientId,
    role,
    location_id: role === "manager" ? locationId : null,
  });
  if (profileError) {
    // Do not leave a login that has no profile.
    await admin.auth.admin.deleteUser(created.user.id);
    return fail(describeDbError(profileError, "Could not create user."));
  }

  revalidatePath(`${ADMIN_PATH}/${clientId}`);
  return { ok: true, data: { email, password } };
}

async function findTenantUserRole(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  // Superadmin accounts are never managed from the panel.
  if (!data || data.role === "superadmin") return null;
  return data.role as string;
}

export async function resetPasswordAction(
  _prev: ActionResult<{ password: string }> | null,
  formData: FormData
): Promise<ActionResult<{ password: string }>> {
  await requireSuperadmin();
  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return fail("Invalid user.");

  const admin = createAdminClient();
  if (!(await findTenantUserRole(admin, parsed.data.userId))) return fail("User not found.");

  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, { password });
  if (error) return fail("Could not reset password.");

  return { ok: true, data: { password } };
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  await requireSuperadmin();
  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) throw new Error("Invalid user.");

  const admin = createAdminClient();
  if (!(await findTenantUserRole(admin, parsed.data.userId))) throw new Error("User not found.");

  // profiles.id references auth.users on delete cascade.
  const { error } = await admin.auth.admin.deleteUser(parsed.data.userId);
  if (error) throw new Error("Could not delete user.");
  revalidatePath(ADMIN_PATH, "layout");
}

export async function deleteLocationAction(formData: FormData): Promise<void> {
  await requireSuperadmin();
  const locationId = String(formData.get("locationId") ?? "");
  if (!userIdSchema.safeParse({ userId: locationId }).success) throw new Error("Invalid location.");

  const admin = createAdminClient();
  const { error } = await admin.from("locations").delete().eq("id", locationId);
  if (error) throw new Error("Could not delete location.");
  revalidatePath(ADMIN_PATH, "layout");
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass. If `deleteUserAction` test fails on message, confirm the thrown text is exactly `User not found.`.

- [ ] **Step 5: Commit**

```bash
git add "app/dashboard/(protected)/admin/actions.ts" tests/admin-actions.test.ts
git commit -m "feat: superadmin server actions for clients, locations and users

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Superadmin panel UI and navigation

**Files:**
- Create: `app/dashboard/(protected)/admin/layout.tsx`
- Create: `app/dashboard/(protected)/admin/page.tsx`
- Create: `app/dashboard/(protected)/admin/create-client-form.tsx`
- Create: `app/dashboard/(protected)/admin/credentials-notice.tsx`
- Create: `app/dashboard/(protected)/admin/[clientId]/page.tsx`
- Create: `app/dashboard/(protected)/admin/[clientId]/create-location-form.tsx`
- Create: `app/dashboard/(protected)/admin/[clientId]/create-user-form.tsx`
- Create: `app/dashboard/(protected)/admin/[clientId]/user-row.tsx`
- Modify: `app/dashboard/(protected)/sidebar.tsx`

**Interfaces:**
- Consumes: all actions from Task 5; `createAdminClient`; `getProfile`; `PageHeader`, `Card`, `Input`, `Label`, `Button` from existing code.
- Produces: routes `/dashboard/admin` and `/dashboard/admin/[clientId]`.

- [ ] **Step 1: Route guard layout**

`app/dashboard/(protected)/admin/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/get-profile";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile || profile.role !== "superadmin") redirect("/dashboard");
  return <>{children}</>;
}
```

- [ ] **Step 2: Shared credentials notice**

`app/dashboard/(protected)/admin/credentials-notice.tsx`:

```tsx
export function CredentialsNotice({ email, password }: { email?: string; password: string }) {
  return (
    <div role="status" className="rounded-[14px] border border-cool bg-white p-4 text-sm">
      <p className="font-medium text-ink">Copy these credentials now. The password is not shown again.</p>
      {email && (
        <p className="mt-2 text-body">
          Email: <span className="font-mono text-ink">{email}</span>
        </p>
      )}
      <p className="text-body">
        Password: <span className="font-mono text-ink select-all">{password}</span>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Clients list page and create form**

`app/dashboard/(protected)/admin/create-client-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClientAction } from "./actions";

export function CreateClientForm() {
  const [state, formAction, pending] = useActionState(createClientAction, null);

  return (
    <form action={formAction} className="flex gap-3 flex-wrap items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name">Name</Label>
        <Input id="client-name" name="name" placeholder="Don Chuys" required className="w-48" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-slug">Slug</Label>
        <Input id="client-slug" name="slug" placeholder="don-chuys" required className="w-48" />
      </div>
      <Button type="submit" disabled={pending}>Add client</Button>
      {state && !state.ok && (
        <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
```

`app/dashboard/(protected)/admin/page.tsx`:

```tsx
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "../page-header";
import { CreateClientForm } from "./create-client-form";

export default async function AdminClientsPage() {
  const admin = createAdminClient();
  const { data: clients, error } = await admin
    .from("clients")
    .select("id, name, slug, locations(count)")
    .order("name");
  if (error) throw error;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Clients" description="Onboard clients, their locations and their users." />
      <Card>
        <CardHeader>
          <CardTitle>Add client</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateClientForm />
        </CardContent>
      </Card>

      {(clients ?? []).length === 0 ? (
        <p className="text-sm text-body">No clients yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {(clients ?? []).map((c) => (
            <Link key={c.id} href={`/dashboard/admin/${c.id}`}>
              <Card size="sm" className="p-4">
                <CardContent className="p-0 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-sm text-body">{c.slug}</p>
                  </div>
                  <p className="text-sm text-body">{c.locations?.[0]?.count ?? 0} locations</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Client detail forms**

`app/dashboard/(protected)/admin/[clientId]/create-location-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLocationAction } from "../actions";

export function CreateLocationForm({ clientId, clientSlug }: { clientId: string; clientSlug: string }) {
  const [state, formAction, pending] = useActionState(createLocationAction, null);

  return (
    <form action={formAction} className="flex gap-3 flex-wrap items-end">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loc-name">Name</Label>
        <Input id="loc-name" name="name" placeholder="Downtown Branch" required className="w-44" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loc-slug">Slug (globally unique)</Label>
        <Input id="loc-slug" name="slug" defaultValue={`${clientSlug}-`} required className="w-52" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loc-url">Google review link (optional)</Label>
        <Input id="loc-url" name="googleReviewUrl" placeholder="https://g.page/r/XXXX/review" className="w-64" />
      </div>
      <Button type="submit" disabled={pending}>Add location</Button>
      {state && !state.ok && (
        <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
```

`app/dashboard/(protected)/admin/[clientId]/create-user-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CredentialsNotice } from "../credentials-notice";
import { createUserAction } from "../actions";

export function CreateUserForm({
  clientId,
  locations,
}: {
  clientId: string;
  locations: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createUserAction, null);
  const selectClass = "h-9 rounded-[14px] border border-cool bg-white px-3 text-sm text-ink";

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex gap-3 flex-wrap items-end">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-email">Email</Label>
          <Input id="user-email" name="email" type="email" placeholder="owner@client.com" required className="w-64" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-role">Role</Label>
          <select id="user-role" name="role" defaultValue="admin" className={selectClass}>
            <option value="admin">Admin (all locations)</option>
            <option value="manager">Manager (one location)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-location">Location (managers only)</Label>
          <select id="user-location" name="locationId" defaultValue="" className={selectClass}>
            <option value="">-</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>Create user</Button>
      </form>
      {state && !state.ok && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <CredentialsNotice email={state.data.email} password={state.data.password} />}
    </div>
  );
}
```

`app/dashboard/(protected)/admin/[clientId]/user-row.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CredentialsNotice } from "../credentials-notice";
import { deleteUserAction, resetPasswordAction } from "../actions";

export function UserRow({
  user,
}: {
  user: { id: string; email: string; role: string; locationName: string | null };
}) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);

  return (
    <Card size="sm" className="p-4">
      <CardContent className="p-0 flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="font-medium text-ink">{user.email}</p>
            <p className="text-sm text-body capitalize">
              {user.role}
              {user.locationName ? ` · ${user.locationName}` : ""}
            </p>
          </div>
          <form action={formAction}>
            <input type="hidden" name="userId" value={user.id} />
            <Button type="submit" variant="outline" size="sm" disabled={pending}>Reset password</Button>
          </form>
          <form action={deleteUserAction}>
            <input type="hidden" name="userId" value={user.id} />
            <Button type="submit" variant="ghost" size="sm">Delete</Button>
          </form>
        </div>
        {state && !state.ok && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        {state?.ok && <CredentialsNotice email={user.email} password={state.data.password} />}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Client detail page**

`app/dashboard/(protected)/admin/[clientId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "../../page-header";
import { deleteLocationAction } from "../actions";
import { CreateLocationForm } from "./create-location-form";
import { CreateUserForm } from "./create-user-form";
import { UserRow } from "./user-row";

export default async function AdminClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const [{ data: client }, { data: locations }, { data: profiles }] = await Promise.all([
    admin.from("clients").select("id, name, slug").eq("id", clientId).maybeSingle(),
    admin.from("locations").select("id, name, slug, google_review_url").eq("client_id", clientId).order("name"),
    admin.from("profiles").select("id, role, location_id").eq("client_id", clientId),
  ]);
  if (!client) notFound();

  const locationNames = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const users = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      return {
        id: p.id,
        role: p.role as string,
        email: data.user?.email ?? "(unknown)",
        locationName: p.location_id ? (locationNames.get(p.location_id) ?? null) : null,
      };
    })
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={client.name}
        description={`Slug: ${client.slug}`}
        actions={
          <Link href="/dashboard/admin">
            <Button variant="outline" size="sm">All clients</Button>
          </Link>
        }
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Locations</h2>
        <Card>
          <CardHeader>
            <CardTitle>Add location</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateLocationForm clientId={client.id} clientSlug={client.slug} />
          </CardContent>
        </Card>
        {(locations ?? []).map((l) => (
          <Card key={l.id} size="sm" className="p-4">
            <CardContent className="p-0 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium text-ink">{l.name}</p>
                <p className="text-sm text-body">/r/{l.slug}</p>
              </div>
              <form action={deleteLocationAction}>
                <input type="hidden" name="locationId" value={l.id} />
                <Button type="submit" variant="ghost" size="sm" title="Also deletes this location's reviews">
                  Delete
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Users</h2>
        <Card>
          <CardHeader>
            <CardTitle>Add user</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateUserForm
              clientId={client.id}
              locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
            />
          </CardContent>
        </Card>
        {users.map((u) => (
          <UserRow key={u.id} user={u} />
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Sidebar entry for superadmin**

In `app/dashboard/(protected)/sidebar.tsx` replace the `items` computation:

```tsx
  const items =
    role === "superadmin"
      ? [{ href: "/dashboard/admin", label: "Clients" }]
      : role === "admin"
        ? [...NAV_ITEMS, { href: "/dashboard/config", label: "Settings" }]
        : NAV_ITEMS;
```

and make nested admin routes highlight their parent by replacing `const active = pathname === item.href;` with:

```tsx
          const active =
            item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
```

- [ ] **Step 7: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all succeed. The build must not report `server-only` imported from a Client Component; if it does, a client component imports `lib/supabase/admin.ts` transitively, so move that import into a server file.

- [ ] **Step 8: Manual check (needs migrations 0010-0012 applied and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`)**

1. Create the first superadmin (see Task 8), run `npm run dev`, log in at `/dashboard/login`.
2. Expect redirect to `/dashboard/admin`; visiting `/dashboard`, `/dashboard/reviews` and `/dashboard/config` redirects back to `/dashboard/admin`.
3. Create client "Test Co" slug `test-co`; open it; add location slug `test-co-main`; add an admin user; copy the password; log out and log in as that admin; confirm they see only Test Co and `/dashboard/admin` redirects them to `/dashboard`.
4. Add a second client with a location using the same slug `test-co-main`; expect the message "That slug is already in use. Choose a different one."
5. As superadmin, reset the admin's password, confirm the old one stops working; delete the user.

- [ ] **Step 9: Commit**

```bash
git add "app/dashboard/(protected)/admin" "app/dashboard/(protected)/sidebar.tsx"
git commit -m "feat: superadmin panel for clients, locations and users

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Readable slug errors in the client dashboard

**Files:**
- Modify: `app/dashboard/(protected)/config/actions.ts:14-35`
- Modify: `app/dashboard/(protected)/config/locations-section.tsx:1-39`

**Interfaces:**
- Consumes: `ActionResult`, `describeDbError` (Task 4).
- Produces: `createLocation(prev: ActionResult | null, formData: FormData): Promise<ActionResult>` (signature change; only `locations-section.tsx` calls it).

Thrown errors from server actions are masked in production builds, so the message has to travel as a return value.

- [ ] **Step 1: Change `createLocation` to return a result**

In `config/actions.ts` add imports:

```ts
import { describeDbError } from "@/lib/db-errors";
import type { ActionResult } from "@/lib/action-result";
```

Replace the whole `createLocation` function with:

```ts
export async function createLocation(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await requireAdmin();
  const parsed = locationFormSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    googleReviewUrl: formData.get("googleReviewUrl"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid location." };
  }

  const { name, slug, googleReviewUrl } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({
    client_id: profile.clientId,
    name,
    slug,
    google_review_url: googleReviewUrl,
  });
  if (error) return { ok: false, error: describeDbError(error, "Could not create location.") };
  revalidatePath("/dashboard/config");
  return { ok: true, data: null };
}
```

- [ ] **Step 2: Show the error in the form**

In `config/locations-section.tsx` change the React import to `import { useActionState, useEffect, useState } from "react";`, then at the top of `LocationsSection` add:

```tsx
  const [state, formAction, pending] = useActionState(createLocation, null);
```

change `<form action={createLocation} ...>` to `<form action={formAction} ...>`, make the submit button `<Button type="submit" disabled={pending}>Add</Button>`, and add directly after the button (still inside the form):

```tsx
            {state && !state.ok && (
              <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>
            )}
```

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: pass.

- [ ] **Step 4: Manual check**

As a client admin, add a location whose slug already exists (any client). Expect "That slug is already in use. Choose a different one." under the form.

- [ ] **Step 5: Commit**

```bash
git add "app/dashboard/(protected)/config"
git commit -m "fix: show a clear message when a location slug is already taken

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, bootstrap, final verification and rollout

**Files:**
- Modify: `README.md` (append section)
- Modify: `docs/superpowers/specs/2026-10-08-multi-tenant-admin-design.md` (sync with plan)

- [ ] **Step 1: Document operations in the README**

Append to `README.md`:

````markdown
## Multi-tenant operations

### Environment
`SUPABASE_SERVICE_ROLE_KEY` is required on the server (Vercel: Production and Preview, never exposed to the browser). The superadmin panel uses it.

### First superadmin
Create the auth user in Supabase Dashboard (Authentication > Users > Add user), then run:

```sql
insert into profiles (id, client_id, role)
select id, null, 'superadmin' from auth.users where email = 'YOUR_EMAIL';
```

### Onboarding a client
Log in as superadmin, open `/dashboard/admin`, create the client, add its locations (slugs are globally unique, so prefix them with the client slug), then create the client's admin user and hand over the generated password.

### Isolation test
`psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql` (rolls back; run after any RLS change).
````

- [ ] **Step 2: Sync the spec with what was planned**

In the spec file make these edits: Part 1 RPC returns `id, name, google_review_url` (the thank-you page needs the review link, which is shown to the visitor anyway); the thank-you page `/r/[locationSlug]/t` also switches to the RPC; migrations are `0010` (RPC, additive), `0011` (drop anon policies, applied after deploy) and `0012` (superadmin); the rollout section lists that order.

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all green. Run `git grep -n "NEXT_PUBLIC_SUPABASE_SERVICE" ; git grep -n "SERVICE_ROLE" -- app lib` and confirm the service key is referenced only in `lib/supabase/admin.ts`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs
git commit -m "docs: multi-tenant operations and spec sync

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Rollout (in this exact order; do not skip the pause between 3 and 4)**

1. Apply `0010` to production Supabase.
2. Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel and push `main` (deploys the app that uses `get_public_location`).
3. Smoke test in production: an existing `/r/<slug>` QR URL loads, a review submits, the thank-you page works, an unknown slug returns 404.
4. Apply `0011`, then re-run the smoke test and `curl` the REST endpoint with the anon key to confirm `clients`, `locations` and `negative_keywords` return `[]`.
5. Apply `0012`, create the first superadmin with the README SQL, onboard a test client through the panel, then delete it.
6. Run `supabase/tests/rls_isolation.sql` against production inside its own rolled-back transaction as a final check.
