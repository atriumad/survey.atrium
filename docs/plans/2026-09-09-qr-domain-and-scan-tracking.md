# QR Fixed Domain + Scan Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** QR codes always encode the production domain (`dcop.atriumad.com`), and every visit to a location's review page is recorded so the dashboard can show scan counts and a reviews/scans conversion rate.

**Architecture:** A `NEXT_PUBLIC_SITE_URL` env var overrides the client-side origin used to build the QR URL. A new `qr_scans` table (RLS mirroring `reviews`) gets one row inserted per request to `/r/[locationSlug]`, best-effort (never blocks the page). The dashboard's Metricas page adds two more metric cards computed from a scan count query and a pure conversion-rate helper.

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase (Postgres + RLS), vitest, bun.

---

### Task 1: Fixed domain for QR generation

**Files:**
- Modify: `app/dashboard/(protected)/config/locations-section.tsx:32-35`

**Step 1: Update the QR URL source**

In `LocationRow`, change:

```tsx
useEffect(() => {
  const url = buildReviewUrl(window.location.origin, location.slug);
  generateQrDataUrl(url).then(setQrDataUrl);
}, [location.slug]);
```

to:

```tsx
useEffect(() => {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
  const url = buildReviewUrl(baseUrl, location.slug);
  generateQrDataUrl(url).then(setQrDataUrl);
}, [location.slug]);
```

`buildReviewUrl` itself is unchanged (already takes `baseUrl` as a param, already tested in `tests/qr.test.ts`) — no new test needed here.

**Step 2: Add the env var locally (optional, for testing prod behavior)**

Add to `.env.local` (gitignored, not committed):
```
NEXT_PUBLIC_SITE_URL=https://dcop.atriumad.com
```
Leave it unset if you want QR generation in dev to keep using `localhost`.

**Step 3: Set the env var in Vercel**

Vercel → Project → Settings → Environment Variables → add `NEXT_PUBLIC_SITE_URL` = `https://dcop.atriumad.com` for Production. (Separately, also add the domain itself under Settings → Domains — that's DNS/infra, not code, and not part of this task.)

**Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

**Step 5: Commit**

```bash
git add "app/dashboard/(protected)/config/locations-section.tsx"
git commit -m "feat: use fixed production domain for generated QR codes"
```

---

### Task 2: `qr_scans` table + RLS

**Files:**
- Create: `supabase/migrations/0003_qr_scans.sql`

**Step 1: Write the migration**

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
```

This mirrors the `reviews` table policies in `supabase/migrations/0001_survey_schema.sql:83,108-115` exactly.

**Step 2: Apply the migration**

Run it the same way you ran `0002_bootstrap_admin.sql` (Supabase SQL Editor, or `supabase db push` if linked).

**Step 3: Commit**

```bash
git add supabase/migrations/0003_qr_scans.sql
git commit -m "feat: add qr_scans table with anon-insert RLS"
```

---

### Task 3: Record a scan on every review-page visit

**Files:**
- Modify: `app/r/[locationSlug]/page.tsx`

**Step 1: Update the location query and insert a scan row**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewForm } from "./review-form";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locationSlug: string }>;
}) {
  const { locationSlug } = await params;
  const supabase = await createClient();

  const { data: location } = await supabase
    .from("locations")
    .select("id, name, client_id")
    .eq("slug", locationSlug)
    .single();

  if (!location) {
    notFound();
  }

  try {
    await supabase
      .from("qr_scans")
      .insert({ client_id: location.client_id, location_id: location.id });
  } catch {
    // Scan tracking is best-effort — never block the review page over it.
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <h1 className="text-2xl font-semibold text-center">{location.name}</h1>
      <p className="text-muted-foreground text-center">Cual fue tu experiencia hoy?</p>
      <div className="w-full max-w-sm">
        <ReviewForm locationSlug={locationSlug} />
      </div>
    </main>
  );
}
```

Note: `supabase-js` insert calls resolve to `{ data, error }` rather than throwing, so the `try/catch` alone won't catch an RLS/insert failure — that's fine, we simply don't check `error` here since a failed scan insert is not actionable and must never surface to the visitor.

**Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

**Step 3: Manual smoke test**

Run: `bun run dev`, visit `http://localhost:3000/r/<an-existing-slug>`, then in Supabase SQL Editor:
```sql
select * from qr_scans order by created_at desc limit 5;
```
Expected: a new row for that location.

**Step 4: Commit**

```bash
git add "app/r/[locationSlug]/page.tsx"
git commit -m "feat: record a qr_scans row on every review page visit"
```

---

### Task 4: Conversion-rate helper

**Files:**
- Modify: `lib/metrics.ts`
- Test: `tests/metrics.test.ts`

**Step 1: Write the failing test**

Append to `tests/metrics.test.ts`:

```ts
import { calculateConversionRate } from "@/lib/metrics";

describe("calculateConversionRate", () => {
  it("returns the percent of scans that became reviews", () => {
    expect(calculateConversionRate(50, 200)).toBe(25);
  });

  it("returns 0 when there are no scans", () => {
    expect(calculateConversionRate(10, 0)).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/metrics.test.ts`
Expected: FAIL — `calculateConversionRate is not a function` (or not exported).

**Step 3: Implement**

Add to `lib/metrics.ts`:

```ts
export function calculateConversionRate(reviewsTotal: number, scansTotal: number): number {
  if (scansTotal === 0) return 0;
  return Math.round((reviewsTotal / scansTotal) * 100);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/metrics.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/metrics.ts tests/metrics.test.ts
git commit -m "feat: add scan-to-review conversion rate calculation"
```

---

### Task 5: Show scan count + conversion rate on the dashboard

**Files:**
- Modify: `app/dashboard/(protected)/page.tsx`

**Step 1: Query scan count and add two metric cards**

In `DashboardHomePage`, after the existing `reviews` query (which already applies `effectiveLocation` filtering), add a scan count query with the same filter, then compute conversion:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { summarizeReviews, calculateConversionRate } from "@/lib/metrics";
import { LocationFilter } from "./location-filter";
import type { Review } from "@/lib/types";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("client_id", profile.clientId);

  const effectiveLocation = profile.role === "manager" ? profile.locationId : location;

  let reviewsQuery = supabase.from("reviews").select("*").eq("client_id", profile.clientId);
  if (effectiveLocation) reviewsQuery = reviewsQuery.eq("location_id", effectiveLocation);
  const { data: reviews } = await reviewsQuery;
  const summary = summarizeReviews((reviews ?? []) as Review[]);

  let scansQuery = supabase
    .from("qr_scans")
    .select("*", { count: "exact", head: true })
    .eq("client_id", profile.clientId);
  if (effectiveLocation) scansQuery = scansQuery.eq("location_id", effectiveLocation);
  const { count: scansTotal } = await scansQuery;
  const conversionRate = calculateConversionRate(summary.total, scansTotal ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Metricas</h1>
        {profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total reviews" value={summary.total} />
        <MetricCard label="Rating promedio" value={summary.averageRating.toFixed(1)} />
        <MetricCard label="% Buenas" value={`${summary.goodPercent}%`} />
        <MetricCard label="% Compartidas a Google" value={`${summary.sharedPercent}%`} />
        <MetricCard label="Escaneos QR" value={scansTotal ?? 0} />
        <MetricCard label="Conversion" value={`${conversionRate}%`} />
      </div>

      {/* ... rest of the component (star distribution) unchanged ... */}
    </div>
  );
}
```

(Keep the existing `MetricCard` function and the star-distribution block below unchanged — only the two new cards and the `scansQuery`/`conversionRate` computation are added.)

**Step 2: Typecheck and build**

Run: `bunx tsc --noEmit && bun run build`
Expected: no errors.

**Step 3: Manual smoke test**

Run: `bun run dev`, log into `/dashboard`, confirm "Escaneos QR" and "Conversion" cards render with real numbers (visit `/r/<slug>` a couple times first to generate scan rows).

**Step 4: Run full test suite**

Run: `bun test`
Expected: all tests pass (existing + new).

**Step 5: Commit**

```bash
git add "app/dashboard/(protected)/page.tsx"
git commit -m "feat: show QR scan count and conversion rate on dashboard"
```
