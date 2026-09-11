# Overview Page Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename the dashboard's "Metricas" page to "Overview," group its 6 metric cards into two labeled clusters (Actividad / Calidad), align the star-distribution heading with the same eyebrow style, and add a last-24h reviews table below it.

**Architecture:** Single-file rework of `app/dashboard/(protected)/page.tsx` (query + layout changes) plus a one-line label change in the sidebar. The 24h table reuses the existing `ReviewsTable` component unmodified — no new components, no new business logic beyond a date-range filter on an existing query shape (the same `gte`/`lte` pattern already used on the Reviews page).

**Tech Stack:** Next.js 16 (Server Components), Supabase, Tailwind v4 (existing eyebrow/Card conventions).

---

### Task 1: Rename to Overview, group metrics into clusters, align star-distribution heading

**Files:**
- Modify: `app/dashboard/(protected)/page.tsx`
- Modify: `app/dashboard/(protected)/sidebar.tsx`

**Step 1: Update the sidebar label**

In `app/dashboard/(protected)/sidebar.tsx`, find:
```tsx
const NAV_ITEMS = [
  { href: "/dashboard", label: "Metricas" },
  { href: "/dashboard/reviews", label: "Reviews" },
];
```
Change to:
```tsx
const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/reviews", label: "Reviews" },
];
```

**Step 2: Rewrite the page**

Read `app/dashboard/(protected)/page.tsx` first (to confirm it matches what's below — it may have shifted since this plan was written). Replace its entire contents with:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { summarizeReviews, calculateConversionRate } from "@/lib/metrics";
import { LocationFilter } from "./location-filter";
import { PageHeader } from "./page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewsTable } from "./reviews/reviews-table";
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

  let query = supabase.from("reviews").select("*").eq("client_id", profile.clientId);
  const effectiveLocation = profile.role === "manager" ? profile.locationId : location;
  if (effectiveLocation) query = query.eq("location_id", effectiveLocation);

  const { data: reviews } = await query;
  const summary = summarizeReviews((reviews ?? []) as Review[]);

  let scansQuery = supabase
    .from("qr_scans")
    .select("*", { count: "exact", head: true })
    .eq("client_id", profile.clientId);
  if (effectiveLocation) scansQuery = scansQuery.eq("location_id", effectiveLocation);
  const { count: scansTotal } = await scansQuery;
  const conversionRate = calculateConversionRate(summary.total, scansTotal ?? 0);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let recentQuery = supabase
    .from("reviews")
    .select("*")
    .eq("client_id", profile.clientId)
    .gte("created_at", twentyFourHoursAgo)
    .order("created_at", { ascending: false });
  if (effectiveLocation) recentQuery = recentQuery.eq("location_id", effectiveLocation);
  const { data: recentReviews } = await recentQuery;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        actions={profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Actividad</h2>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Total reviews" value={summary.total} />
          <MetricCard label="Escaneos QR" value={scansTotal ?? 0} />
          <MetricCard label="Conversion" value={conversionRate === null ? "—" : `${conversionRate}%`} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Calidad</h2>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Rating promedio" value={summary.averageRating.toFixed(1)} />
          <MetricCard label="% Buenas" value={`${summary.goodPercent}%`} />
          <MetricCard label="% Compartidas a Google" value={`${summary.sharedPercent}%`} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Distribucion de estrellas</h2>
        <div className="flex gap-3 items-end h-40">
          {([1, 2, 3, 4, 5] as const).map((star) => (
            <div key={star} className="flex flex-col items-center gap-2 flex-1">
              <div
                className={`w-full rounded-t-[12px] transition-all ${
                  star <= 3 ? "bg-amber" : "bg-green-fill"
                }`}
                style={{
                  height: `${summary.total > 0 ? (summary.starDistribution[star] / summary.total) * 100 : 0}%`,
                }}
              />
              <span className="text-sm text-body">{star}★</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Ultimas 24 horas</h2>
        <ReviewsTable reviews={(recentReviews ?? []) as Review[]} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card size="sm" className="p-4">
      <CardContent className="p-0 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-body">{label}</p>
        <p className="text-3xl font-semibold text-ink">{value}</p>
      </CardContent>
    </Card>
  );
}
```

Notes on this rewrite versus the prior version:
- `summary`/`scansTotal`/`conversionRate` computation is unchanged — same queries, same variables.
- New: `twentyFourHoursAgo` + `recentQuery`, mirroring the exact `gte`/`order`/`effectiveLocation` pattern already used on `app/dashboard/(protected)/reviews/page.tsx` — no new query idioms introduced.
- New import: `ReviewsTable` from `./reviews/reviews-table` (a relative path *down* into the `reviews/` subfolder — this file lives at `app/dashboard/(protected)/page.tsx`, and `reviews-table.tsx` lives at `app/dashboard/(protected)/reviews/reviews-table.tsx`, so `./reviews/reviews-table` is correct, not `../reviews/reviews-table`).
- `MetricCard` function body is unchanged, just re-called under two grids instead of one.
- The star-distribution block's heading changes from `<h2 className="text-xl font-medium text-ink mb-3">` (with `mb-3` handling its own spacing) to the same eyebrow style as the two clusters above (`text-xs uppercase tracking-wide font-semibold text-body`), wrapped in a `flex flex-col gap-3` like the others for consistent spacing — the outer page wrapper's `gap-6` handles spacing between sections, `gap-3` handles spacing between each section's own heading and content.

**Step 3: Typecheck and build**

Run: `bunx tsc --noEmit && bun run build`
Expected: no errors. Build output should still list `/dashboard` as a dynamic route (unchanged route).

**Step 4: Run the full test suite**

Run: `bun test`
Expected: all existing tests still pass (this task adds no new test files — no new pure-logic functions were introduced, only a query + JSX rework).

**Step 5: Manual check**

Run: `bun run dev`, log in, open `/dashboard`. Confirm: sidebar link reads "Overview" and is still the active/highlighted item on this route, the page shows "Overview" as its title, two metric clusters render with "Actividad" and "Calidad" eyebrows (3 cards each), the star-distribution section has the same eyebrow style, and a "Ultimas 24 horas" table renders at the bottom — either recent reviews or the "Sin reviews todavia." empty state if none exist in the last 24h.

**Step 6: Commit**

```bash
git add "app/dashboard/(protected)/page.tsx" "app/dashboard/(protected)/sidebar.tsx"
git commit -m "feat: rework Metricas into Overview with grouped metrics and 24h activity table"
```
