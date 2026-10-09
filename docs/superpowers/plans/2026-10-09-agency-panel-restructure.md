# Agency panel restructure (delivery 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single long agency page into a per-client workspace (Summary, Locations, Users, Reviews, Settings) with a global Overview and Clients list, reusing the tenant dashboard's data logic.

**Architecture:** Tenant dashboard queries move into `lib/dashboard-data.ts` functions that take a Supabase client and a `clientId`; the tenant pages call them with the RLS client, the agency pages with the service-role client. The overview UI moves into a shared server component. Agency routes live under `/dashboard/admin/clients/[clientId]/…` with a shared layout and tab bar; every page, layout and action re-checks `requireSuperadmin()`.

**Tech Stack:** Next.js 16 App Router (server components, server actions, React 19 `useActionState`), Supabase JS, Zod 4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-09-agency-panel-restructure-design.md`

## Global Constraints

- Branch `feat/multi-tenant-admin`, worktree `/Users/ventura/Desktop/d/atrium/survey.dcop.atrium-mt`. Do not push.
- Every page, layout and server action under `/dashboard/admin` calls `await requireSuperadmin()` as its FIRST statement (layouts do not re-run on every navigation, so pages repeat it).
- Shared loaders in `lib/dashboard-data.ts` never import `lib/supabase/admin` and always apply `.eq("client_id", clientId)`.
- Tenant behavior must not change: managers stay locked to their `profile.locationId`; admins and managers see exactly the data they saw before.
- A location's slug is immutable (printed QR codes depend on it): no action accepts a slug change for locations.
- Use import aliases for files under the route group, e.g. `@/app/dashboard/(protected)/admin/actions`.
- Queries in loaders and pages throw on error (no misleading empty states).
- Verification commands: `npx tsc --noEmit` (clean), `npm test`, `npx eslint "app/dashboard/(protected)" lib tests components`. A Turbopack build fails in this worktree only because `node_modules` is a symlink; use `npx next build --webpack`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Tenant Overview and Reviews pages show identical data for an admin and for a manager after the refactor, including the manager's forced location (Task 2).
- Every loader query carries the `client_id` filter, and a `location` id belonging to another client returns nothing for the agency pages (Tasks 1, 3).
- A non-superadmin cannot render any agency page or call any agency action (Tasks 3, 4, 5).
- `deleteClientAction` refuses a wrong confirmation slug, deletes the client's auth users before the client row, and never deletes the client if a user deletion fails (Task 5).
- `updateLocationAction` cannot change a slug even if a `slug` field is posted (Task 5).
- No link anywhere still points to the removed `/dashboard/admin/[clientId]` route (Task 4).
- Empty clients (no locations/users/reviews) render explicit empty states, not blanks (Tasks 3, 4).

## File Structure

| File | Responsibility |
|---|---|
| `lib/dashboard-data.ts` | `loadOverviewData`, `loadReviewsPage`, `loadClientsIndex`, `buildAgencyOverview` |
| `components/dashboard/overview-view.tsx` | Shared overview UI (cards, rating distribution, last 24h) |
| `app/dashboard/(protected)/page.tsx`, `reviews/page.tsx` | Tenant pages, now thin |
| `app/dashboard/(protected)/sidebar.tsx` | Superadmin nav: Overview, Clients |
| `app/dashboard/(protected)/admin/page.tsx` | Agency Overview |
| `app/dashboard/(protected)/admin/clients/page.tsx` + `create-client-form.tsx` | Clients list + create |
| `app/dashboard/(protected)/admin/clients/[clientId]/layout.tsx` + `client-tabs.tsx` | Client workspace shell |
| `…/[clientId]/page.tsx`, `locations/`, `users/`, `reviews/`, `settings/` | The five sections |
| `app/dashboard/(protected)/admin/actions.ts` | Existing actions + `updateClientAction`, `updateLocationAction`, `deleteClientAction` |

---

### Task 1: Shared data layer

**Files:**
- Create: `lib/dashboard-data.ts`
- Test: `tests/dashboard-data.test.ts`

**Interfaces:**
- Consumes: `summarizeReviews`, `calculateConversionRate`, `describeAverageRating`, `describeRatingTrend`, `ReviewSummary`, `RatingTrend` from `lib/metrics.ts`; `Review`, `ReviewWithLocation` from `lib/types.ts`.
- Produces:
  - `type DashboardClient = SupabaseClient` (alias of `SupabaseClient` from `@supabase/supabase-js`)
  - `interface OverviewScope { clientId: string; locationId?: string | null }`
  - `interface OverviewData { summary: ReviewSummary; scansTotal: number; conversionRate: number | null; ratingTier: string; trend: RatingTrend | null; recentReviews: ReviewWithLocation[] }`
  - `loadOverviewData(supabase: SupabaseClient, scope: OverviewScope, now?: number): Promise<OverviewData>`
  - `interface ReviewsPageParams { clientId: string; locationId?: string | null; classification?: string | null; from?: string | null; to?: string | null; page: number; pageSize: number }`
  - `loadReviewsPage(supabase: SupabaseClient, params: ReviewsPageParams): Promise<{ reviews: ReviewWithLocation[]; totalPages: number }>`
  - `interface ClientIndexRow { id: string; name: string; slug: string; locationsCount: number; usersCount: number; lastReviewAt: string | null }`
  - `toClientIndexRow(raw: RawClientRow): ClientIndexRow`
  - `loadClientsIndex(admin: SupabaseClient): Promise<ClientIndexRow[]>`
  - `interface AgencyOverview { totals: { clients: number; locations: number; reviews30d: number; average30d: number }; recentClients: ClientIndexRow[] }`
  - `buildAgencyOverview(clients: ClientIndexRow[], ratings30d: number[]): AgencyOverview`
  - `loadAgencyOverview(admin: SupabaseClient, now?: number): Promise<AgencyOverview>`

- [ ] **Step 1: Write the failing tests**

Create `tests/dashboard-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAgencyOverview,
  loadOverviewData,
  loadReviewsPage,
  toClientIndexRow,
} from "@/lib/dashboard-data";

type Op = [string, ...unknown[]];
type Result = { data?: unknown; count?: number | null; error?: unknown };

function fakeSupabase(tables: Record<string, Result>) {
  const calls: { table: string; ops: Op[] }[] = [];
  const from = (table: string) => {
    const call = { table, ops: [] as Op[] };
    calls.push(call);
    const result = tables[table] ?? { data: [] };
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "gte", "lt", "lte", "order", "range"]) {
      builder[op] = (...args: unknown[]) => {
        call.ops.push([op, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: result.data ?? null, count: result.count ?? null, error: result.error ?? null });
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const review = (rating: number, classification: "good" | "bad" = "good") => ({
  id: `r${rating}`,
  client_id: "c1",
  location_id: "l1",
  rating,
  comment: null,
  email: null,
  classification,
  matched_keywords: null,
  shared_to_google: false,
  created_at: "2026-10-01T00:00:00Z",
});

const hasOp = (ops: Op[], name: string, ...args: unknown[]) =>
  ops.some((op) => op[0] === name && args.every((a, i) => op[i + 1] === a));

describe("loadOverviewData", () => {
  it("scopes every query to the client", async () => {
    const { client, calls } = fakeSupabase({ reviews: { data: [review(5)] }, qr_scans: { count: 4 } });
    await loadOverviewData(client, { clientId: "c1" });
    expect(calls.length).toBe(5);
    for (const call of calls) expect(hasOp(call.ops, "eq", "client_id", "c1")).toBe(true);
  });

  it("applies the location filter to every query only when given", async () => {
    const withLoc = fakeSupabase({ reviews: { data: [] }, qr_scans: { count: 0 } });
    await loadOverviewData(withLoc.client, { clientId: "c1", locationId: "l9" });
    for (const call of withLoc.calls) expect(hasOp(call.ops, "eq", "location_id", "l9")).toBe(true);

    const noLoc = fakeSupabase({ reviews: { data: [] }, qr_scans: { count: 0 } });
    await loadOverviewData(noLoc.client, { clientId: "c1", locationId: null });
    for (const call of noLoc.calls) expect(call.ops.some((op) => op[0] === "eq" && op[1] === "location_id")).toBe(false);
  });

  it("summarizes reviews and computes conversion from scans", async () => {
    const { client } = fakeSupabase({
      reviews: { data: [review(5), review(1, "bad")] },
      qr_scans: { count: 4 },
    });
    const data = await loadOverviewData(client, { clientId: "c1" });
    expect(data.summary.total).toBe(2);
    expect(data.summary.averageRating).toBe(3);
    expect(data.scansTotal).toBe(4);
    expect(data.conversionRate).toBe(50);
    expect(data.ratingTier).toBe("Average");
  });

  it("handles an empty client", async () => {
    const { client } = fakeSupabase({ reviews: { data: [] }, qr_scans: { count: 0 } });
    const data = await loadOverviewData(client, { clientId: "c1" });
    expect(data.summary.total).toBe(0);
    expect(data.conversionRate).toBeNull();
    expect(data.ratingTier).toBe("No data yet");
    expect(data.trend).toBeNull();
    expect(data.recentReviews).toEqual([]);
  });

  it("throws when a query fails", async () => {
    const { client } = fakeSupabase({ reviews: { error: new Error("boom") }, qr_scans: { count: 0 } });
    await expect(loadOverviewData(client, { clientId: "c1" })).rejects.toThrow("boom");
  });
});

describe("loadReviewsPage", () => {
  it("scopes by client, composes filters and pages with range", async () => {
    const { client, calls } = fakeSupabase({ reviews: { data: [review(5)], count: 60 } });
    const result = await loadReviewsPage(client, {
      clientId: "c1",
      locationId: "l1",
      classification: "bad",
      from: "2026-01-01",
      to: "2026-02-01",
      page: 3,
      pageSize: 25,
    });
    expect(result.totalPages).toBe(3);
    expect(result.reviews).toHaveLength(1);
    for (const call of calls) {
      expect(hasOp(call.ops, "eq", "client_id", "c1")).toBe(true);
      expect(hasOp(call.ops, "eq", "location_id", "l1")).toBe(true);
      expect(hasOp(call.ops, "eq", "classification", "bad")).toBe(true);
      expect(hasOp(call.ops, "gte", "created_at", "2026-01-01")).toBe(true);
      expect(hasOp(call.ops, "lte", "created_at", "2026-02-01")).toBe(true);
    }
    expect(hasOp(calls[0].ops, "range", 50, 74)).toBe(true);
  });

  it("returns at least one page when there are no reviews", async () => {
    const { client } = fakeSupabase({ reviews: { data: [], count: 0 } });
    const result = await loadReviewsPage(client, { clientId: "c1", page: 1, pageSize: 25 });
    expect(result.totalPages).toBe(1);
  });

  it("throws when a query fails", async () => {
    const { client } = fakeSupabase({ reviews: { error: new Error("nope") } });
    await expect(loadReviewsPage(client, { clientId: "c1", page: 1, pageSize: 25 })).rejects.toThrow("nope");
  });
});

describe("toClientIndexRow", () => {
  it("maps embedded counts and the latest review", () => {
    expect(
      toClientIndexRow({
        id: "c1",
        name: "Acme",
        slug: "acme",
        locations: [{ count: 2 }],
        profiles: [{ count: 3 }],
        reviews: [{ created_at: "2026-10-01T00:00:00Z" }],
      })
    ).toEqual({
      id: "c1",
      name: "Acme",
      slug: "acme",
      locationsCount: 2,
      usersCount: 3,
      lastReviewAt: "2026-10-01T00:00:00Z",
    });
  });

  it("defaults missing embeds to zero and null", () => {
    expect(toClientIndexRow({ id: "c1", name: "A", slug: "a", locations: [], profiles: [], reviews: [] })).toEqual({
      id: "c1",
      name: "A",
      slug: "a",
      locationsCount: 0,
      usersCount: 0,
      lastReviewAt: null,
    });
  });
});

describe("buildAgencyOverview", () => {
  const row = (id: string, last: string | null, locations = 1) => ({
    id,
    name: id,
    slug: id,
    locationsCount: locations,
    usersCount: 1,
    lastReviewAt: last,
  });

  it("totals clients, locations and the 30 day average", () => {
    const result = buildAgencyOverview([row("a", null, 2), row("b", null, 3)], [5, 3]);
    expect(result.totals).toEqual({ clients: 2, locations: 5, reviews30d: 2, average30d: 4 });
  });

  it("orders recent clients by latest review, clients without reviews last, max 5", () => {
    const clients = [
      row("none", null),
      row("old", "2026-01-01T00:00:00Z"),
      row("new", "2026-10-01T00:00:00Z"),
      row("c4", "2026-05-01T00:00:00Z"),
      row("c5", "2026-04-01T00:00:00Z"),
      row("c6", "2026-03-01T00:00:00Z"),
    ];
    const result = buildAgencyOverview(clients, []);
    expect(result.recentClients.map((c) => c.id)).toEqual(["new", "c4", "c5", "c6", "old"]);
    expect(result.totals.average30d).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/dashboard-data.test.ts`
Expected: FAIL (cannot resolve `@/lib/dashboard-data`).

- [ ] **Step 3: Implement `lib/dashboard-data.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateConversionRate,
  describeAverageRating,
  describeRatingTrend,
  summarizeReviews,
  type RatingTrend,
  type ReviewSummary,
} from "@/lib/metrics";
import type { Review, ReviewWithLocation } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number, now: number): string {
  return new Date(now - days * DAY_MS).toISOString();
}

function averageOf(ratings: number[]): number {
  return ratings.length === 0 ? 0 : ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

export interface OverviewScope {
  clientId: string;
  locationId?: string | null;
}

export interface OverviewData {
  summary: ReviewSummary;
  scansTotal: number;
  conversionRate: number | null;
  ratingTier: string;
  trend: RatingTrend | null;
  recentReviews: ReviewWithLocation[];
}

export async function loadOverviewData(
  supabase: SupabaseClient,
  scope: OverviewScope,
  now: number = Date.now()
): Promise<OverviewData> {
  const { clientId, locationId } = scope;

  let reviewsQuery = supabase.from("reviews").select("*").eq("client_id", clientId);
  if (locationId) reviewsQuery = reviewsQuery.eq("location_id", locationId);

  let scansQuery = supabase
    .from("qr_scans")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId);
  if (locationId) scansQuery = scansQuery.eq("location_id", locationId);

  let currentQuery = supabase
    .from("reviews")
    .select("rating")
    .eq("client_id", clientId)
    .gte("created_at", daysAgoIso(30, now));
  if (locationId) currentQuery = currentQuery.eq("location_id", locationId);

  let previousQuery = supabase
    .from("reviews")
    .select("rating")
    .eq("client_id", clientId)
    .gte("created_at", daysAgoIso(60, now))
    .lt("created_at", daysAgoIso(30, now));
  if (locationId) previousQuery = previousQuery.eq("location_id", locationId);

  let recentQuery = supabase
    .from("reviews")
    .select("*, location:locations(name)")
    .eq("client_id", clientId)
    .gte("created_at", daysAgoIso(1, now))
    .order("created_at", { ascending: false });
  if (locationId) recentQuery = recentQuery.eq("location_id", locationId);

  const [reviewsRes, scansRes, currentRes, previousRes, recentRes] = await Promise.all([
    reviewsQuery,
    scansQuery,
    currentQuery,
    previousQuery,
    recentQuery,
  ]);
  for (const res of [reviewsRes, scansRes, currentRes, previousRes, recentRes]) {
    if (res.error) throw res.error;
  }

  const summary = summarizeReviews((reviewsRes.data ?? []) as Review[]);
  const scansTotal = scansRes.count ?? 0;
  const currentRatings = ((currentRes.data ?? []) as { rating: number }[]).map((r) => r.rating);
  const previousRatings = ((previousRes.data ?? []) as { rating: number }[]).map((r) => r.rating);

  return {
    summary,
    scansTotal,
    conversionRate: calculateConversionRate(summary.total, scansTotal),
    ratingTier: describeAverageRating(summary.averageRating, summary.total),
    trend: describeRatingTrend(averageOf(currentRatings), averageOf(previousRatings), previousRatings.length),
    recentReviews: (recentRes.data ?? []) as ReviewWithLocation[],
  };
}

export interface ReviewsPageParams {
  clientId: string;
  locationId?: string | null;
  classification?: string | null;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
}

export async function loadReviewsPage(
  supabase: SupabaseClient,
  params: ReviewsPageParams
): Promise<{ reviews: ReviewWithLocation[]; totalPages: number }> {
  const { clientId, locationId, classification, from, to, page, pageSize } = params;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  let query = supabase
    .from("reviews")
    .select("*, location:locations(name)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .range(start, end);
  let countQuery = supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId);

  if (locationId) {
    query = query.eq("location_id", locationId);
    countQuery = countQuery.eq("location_id", locationId);
  }
  if (classification) {
    query = query.eq("classification", classification);
    countQuery = countQuery.eq("classification", classification);
  }
  if (from) {
    query = query.gte("created_at", from);
    countQuery = countQuery.gte("created_at", from);
  }
  if (to) {
    query = query.lte("created_at", to);
    countQuery = countQuery.lte("created_at", to);
  }

  const [reviewsRes, countRes] = await Promise.all([query, countQuery]);
  if (reviewsRes.error) throw reviewsRes.error;
  if (countRes.error) throw countRes.error;

  return {
    reviews: (reviewsRes.data ?? []) as ReviewWithLocation[],
    totalPages: Math.max(1, Math.ceil((countRes.count ?? 0) / pageSize)),
  };
}

export interface RawClientRow {
  id: string;
  name: string;
  slug: string;
  locations?: { count: number }[] | null;
  profiles?: { count: number }[] | null;
  reviews?: { created_at: string }[] | null;
}

export interface ClientIndexRow {
  id: string;
  name: string;
  slug: string;
  locationsCount: number;
  usersCount: number;
  lastReviewAt: string | null;
}

export function toClientIndexRow(raw: RawClientRow): ClientIndexRow {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    locationsCount: raw.locations?.[0]?.count ?? 0,
    usersCount: raw.profiles?.[0]?.count ?? 0,
    lastReviewAt: raw.reviews?.[0]?.created_at ?? null,
  };
}

export async function loadClientsIndex(admin: SupabaseClient): Promise<ClientIndexRow[]> {
  const { data, error } = await admin
    .from("clients")
    .select("id, name, slug, locations(count), profiles(count), reviews(created_at)")
    .order("name")
    .order("created_at", { ascending: false, referencedTable: "reviews" })
    .limit(1, { referencedTable: "reviews" });
  if (error) throw error;
  return ((data ?? []) as RawClientRow[]).map(toClientIndexRow);
}

export interface AgencyOverview {
  totals: { clients: number; locations: number; reviews30d: number; average30d: number };
  recentClients: ClientIndexRow[];
}

export function buildAgencyOverview(clients: ClientIndexRow[], ratings30d: number[]): AgencyOverview {
  const byRecency = [...clients].sort((a, b) => {
    if (a.lastReviewAt && b.lastReviewAt) return b.lastReviewAt.localeCompare(a.lastReviewAt);
    if (a.lastReviewAt) return -1;
    if (b.lastReviewAt) return 1;
    return 0;
  });
  return {
    totals: {
      clients: clients.length,
      locations: clients.reduce((sum, c) => sum + c.locationsCount, 0),
      reviews30d: ratings30d.length,
      average30d: averageOf(ratings30d),
    },
    recentClients: byRecency.slice(0, 5),
  };
}

export async function loadAgencyOverview(admin: SupabaseClient, now: number = Date.now()): Promise<AgencyOverview> {
  const [clients, ratingsRes] = await Promise.all([
    loadClientsIndex(admin),
    admin.from("reviews").select("rating").gte("created_at", daysAgoIso(30, now)),
  ]);
  if (ratingsRes.error) throw ratingsRes.error;
  const ratings = ((ratingsRes.data ?? []) as { rating: number }[]).map((r) => r.rating);
  return buildAgencyOverview(clients, ratings);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/dashboard-data.test.ts && npx tsc --noEmit`
Expected: all new tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard-data.ts tests/dashboard-data.test.ts
git commit -m "feat: shared dashboard data loaders for tenant and agency views

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared overview view and tenant page refactor

**Files:**
- Create: `components/dashboard/overview-view.tsx`
- Modify: `app/dashboard/(protected)/page.tsx` (replace whole file)
- Modify: `app/dashboard/(protected)/reviews/page.tsx` (replace whole file)

**Interfaces:**
- Consumes: `loadOverviewData`, `loadReviewsPage`, `OverviewData` (Task 1); existing `describeLocationScope`, `LocationFilter`, `PageHeader`, `ReviewsTable`, `ExportButton`, `ReviewsPager`, `RatingEmoji`, `Card`/`CardContent`, `cn`.
- Produces: `OverviewView({ data }: { data: OverviewData })` server component rendering the metric cards, rating distribution and last-24h table (everything below the page header).

This task is a pure move: behavior of the tenant pages must not change.

- [ ] **Step 1: Create `components/dashboard/overview-view.tsx`**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { RatingEmoji } from "@/components/ui/rating-emoji";
import { ReviewsTable } from "@/app/dashboard/(protected)/reviews/reviews-table";
import type { OverviewData } from "@/lib/dashboard-data";
import { cn } from "cn";

export function OverviewView({ data }: { data: OverviewData }) {
  const { summary, scansTotal, conversionRate, ratingTier, trend, recentReviews } = data;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <AverageRatingCard
          average={summary.averageRating}
          total={summary.total}
          tier={ratingTier}
          trend={trend}
        />
        <MetricCard label="Total reviews" value={summary.total} />
        <MetricCard label="% Good" value={`${summary.goodPercent}%`} />
        <MetricCard label="% Shared to Google" value={`${summary.sharedPercent}%`} />
        <MetricCard label="QR Scans" value={scansTotal} />
        <MetricCard label="Conversion" value={conversionRate === null ? "—" : `${conversionRate}%`} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Rating distribution</h2>
        <div className="rounded-[26px] bg-white border border-cool p-5 flex flex-col gap-3">
          {([5, 4, 3, 2, 1] as const).map((level) => {
            const count = summary.starDistribution[level];
            const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
            return (
              <div key={level} className="flex items-center gap-3">
                <span className="w-8 shrink-0">
                  <RatingEmoji rating={level} size="sm" />
                </span>
                <div className="flex-1 h-3 rounded-full bg-cool overflow-hidden">
                  <div
                    className={`h-full rounded-full ${level <= 3 ? "bg-amber" : "bg-green-fill"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-24 text-right text-sm text-body shrink-0">
                  {count} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Last 24 hours</h2>
        <ReviewsTable reviews={recentReviews} />
      </div>
    </>
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

function AverageRatingCard({
  average,
  total,
  tier,
  trend,
}: {
  average: number;
  total: number;
  tier: string;
  trend: { direction: "up" | "down" | "flat"; delta: number } | null;
}) {
  return (
    <Card size="sm" className="p-4">
      <CardContent className="p-0 flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-body">Average rating</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-3xl font-semibold text-ink">{total > 0 ? average.toFixed(1) : "—"}</p>
          <em className="font-serif italic text-body text-base not-italic:font-serif">{tier}</em>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {total > 0 && <RatingEmoji rating={average} size="sm" />}
          {trend && (
            <span
              className={cn(
                "text-xs font-medium",
                trend.direction === "up" && "text-green",
                trend.direction === "down" && "text-amber-fill",
                trend.direction === "flat" && "text-body"
              )}
            >
              {trend.direction === "up" && "▲"}
              {trend.direction === "down" && "▼"}
              {trend.direction === "flat" && "→"}{" "}
              {trend.delta > 0 ? "+" : ""}
              {trend.delta.toFixed(1)} vs prior 30d
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

Before writing it, open the current `app/dashboard/(protected)/page.tsx` and confirm the card/section markup above is identical to what is there (it was moved verbatim, only the data now comes from `data`); if the current file differs in any class name or text, keep the CURRENT markup.

- [ ] **Step 2: Replace `app/dashboard/(protected)/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { getTenantProfile } from "@/lib/get-profile";
import { describeLocationScope } from "@/lib/location-label";
import { loadOverviewData } from "@/lib/dashboard-data";
import { OverviewView } from "@/components/dashboard/overview-view";
import { LocationFilter } from "./location-filter";
import { PageHeader } from "./page-header";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  const profile = await getTenantProfile();
  if (!profile) return null;

  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("client_id", profile.clientId);

  const effectiveLocation = profile.role === "manager" ? profile.locationId : location;
  const data = await loadOverviewData(supabase, {
    clientId: profile.clientId,
    locationId: effectiveLocation,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description={describeLocationScope(profile.role, effectiveLocation, locations ?? [])}
        actions={profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      />
      <OverviewView data={data} />
    </div>
  );
}
```

- [ ] **Step 3: Replace `app/dashboard/(protected)/reviews/page.tsx`**

First read the current file: keep its exact `searchParams` type, `PAGE_SIZE = 25`, `buildHref` logic and JSX; only the data loading changes. The result must be:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getTenantProfile } from "@/lib/get-profile";
import { describeLocationScope } from "@/lib/location-label";
import { loadReviewsPage } from "@/lib/dashboard-data";
import { ExportButton, ReviewsTable } from "./reviews-table";
import { ReviewsPager } from "./pager";
import { LocationFilter } from "../location-filter";
import { PageHeader } from "../page-header";

const PAGE_SIZE = 25;

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    location?: string;
    classification?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const profile = await getTenantProfile();
  if (!profile) return null;
  const role = profile.role;

  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("client_id", profile.clientId);

  const page = Math.max(1, Number(params.page) || 1);
  const effectiveLocation = profile.role === "manager" ? profile.locationId : params.location;

  const { reviews, totalPages } = await loadReviewsPage(supabase, {
    clientId: profile.clientId,
    locationId: effectiveLocation,
    classification: params.classification,
    from: params.from,
    to: params.to,
    page,
    pageSize: PAGE_SIZE,
  });

  function buildHref(targetPage: number): string {
    const search = new URLSearchParams();
    if (effectiveLocation && role === "admin") search.set("location", effectiveLocation);
    if (params.classification) search.set("classification", params.classification);
    if (params.from) search.set("from", params.from);
    if (params.to) search.set("to", params.to);
    search.set("page", String(targetPage));
    return `?${search.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reviews"
        description={describeLocationScope(profile.role, effectiveLocation, locations ?? [])}
        actions={
          <div className="flex items-center gap-2">
            {profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
            <ExportButton
              filters={{
                location: effectiveLocation ?? null,
                classification: params.classification ?? null,
                from: params.from ?? null,
                to: params.to ?? null,
              }}
            />
          </div>
        }
      />
      <ReviewsTable reviews={reviews} fillTo={PAGE_SIZE} />
      <ReviewsPager page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
```

If the current file contains anything not reproduced above (extra props, wrappers), keep it.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test && npx eslint "app/dashboard/(protected)" components lib`
Expected: clean, all tests pass. `git diff` of the two pages must show only the data-loading and rendering moves, no change to visible text other than what is already in `main` of this branch.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/overview-view.tsx "app/dashboard/(protected)/page.tsx" "app/dashboard/(protected)/reviews/page.tsx"
git commit -m "refactor: tenant overview and reviews pages use shared loaders and view

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Agency shell (sidebar, Overview, Clients list, client workspace layout and Summary)

**Files:**
- Modify: `app/dashboard/(protected)/sidebar.tsx`
- Replace: `app/dashboard/(protected)/admin/page.tsx` (becomes the Overview)
- Move: `app/dashboard/(protected)/admin/create-client-form.tsx` → `app/dashboard/(protected)/admin/clients/create-client-form.tsx` (`git mv`, no content change)
- Create: `app/dashboard/(protected)/admin/clients/page.tsx`
- Create: `app/dashboard/(protected)/admin/clients/[clientId]/layout.tsx`
- Create: `app/dashboard/(protected)/admin/clients/[clientId]/client-tabs.tsx`
- Create: `app/dashboard/(protected)/admin/clients/[clientId]/page.tsx` (Summary)

**Interfaces:**
- Consumes: `loadAgencyOverview`, `loadClientsIndex`, `loadOverviewData` (Task 1); `OverviewView` (Task 2); `requireSuperadmin`, `createAdminClient`.
- Produces: routes `/dashboard/admin`, `/dashboard/admin/clients`, `/dashboard/admin/clients/[clientId]`; `ClientTabs({ clientId, counts })`.

- [ ] **Step 1: Sidebar**

In `sidebar.tsx` change the superadmin items to:

```tsx
      ? [
          { href: "/dashboard/admin", label: "Overview" },
          { href: "/dashboard/admin/clients", label: "Clients" },
        ]
```

and make the active check exact for the two root entries:

```tsx
          const exactOnly = item.href === "/dashboard" || item.href === "/dashboard/admin";
          const active = exactOnly ? pathname === item.href : pathname.startsWith(item.href);
```

- [ ] **Step 2: Agency Overview** — replace `admin/page.tsx`:

```tsx
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { loadAgencyOverview } from "@/lib/dashboard-data";
import { Card, CardContent } from "@/components/ui/card";
import { RatingEmoji } from "@/components/ui/rating-emoji";
import { PageHeader } from "../page-header";

export const dynamic = "force-dynamic";

export default async function AgencyOverviewPage() {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { totals, recentClients } = await loadAgencyOverview(admin);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="All clients at a glance." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Clients" value={totals.clients} />
        <Stat label="Locations" value={totals.locations} />
        <Stat label="Reviews (30 days)" value={totals.reviews30d} />
        <Stat
          label="Average (30 days)"
          value={totals.reviews30d > 0 ? totals.average30d.toFixed(1) : "—"}
          extra={totals.reviews30d > 0 ? <RatingEmoji rating={totals.average30d} size="sm" /> : null}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Recent activity by client</h2>
        {recentClients.length === 0 ? (
          <p className="text-sm text-body">
            No clients yet. <Link className="underline" href="/dashboard/admin/clients">Add the first client</Link>.
          </p>
        ) : (
          recentClients.map((c) => (
            <Link key={c.id} href={`/dashboard/admin/clients/${c.id}`}>
              <Card size="sm" className="p-4">
                <CardContent className="p-0 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-sm text-body">{c.slug}</p>
                  </div>
                  <p className="text-sm text-body">
                    {c.lastReviewAt ? `Last review ${new Date(c.lastReviewAt).toLocaleDateString()}` : "No reviews yet"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, extra }: { label: string; value: string | number; extra?: React.ReactNode }) {
  return (
    <Card size="sm" className="p-4">
      <CardContent className="p-0 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-body">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-3xl font-semibold text-ink">{value}</p>
          {extra}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Clients list** — `git mv "app/dashboard/(protected)/admin/create-client-form.tsx" "app/dashboard/(protected)/admin/clients/create-client-form.tsx"`, then create `admin/clients/page.tsx`:

```tsx
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { loadClientsIndex } from "@/lib/dashboard-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../../page-header";
import { CreateClientForm } from "./create-client-form";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSuperadmin();
  const { q } = await searchParams;
  const admin = createAdminClient();
  const all = await loadClientsIndex(admin);
  const term = (q ?? "").trim().toLowerCase();
  const clients = term
    ? all.filter((c) => c.name.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term))
    : all;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Clients" description="Open a client to manage its locations, users and data." />

      <Card>
        <CardHeader>
          <CardTitle>Add client</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateClientForm />
        </CardContent>
      </Card>

      <form className="flex items-center gap-2" role="search">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search by name or slug" className="w-64" />
        <Button type="submit" variant="outline" size="sm">Search</Button>
      </form>

      {clients.length === 0 ? (
        <p className="text-sm text-body">{term ? "No clients match that search." : "No clients yet."}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/dashboard/admin/clients/${c.id}`}>
              <Card size="sm" className="p-4">
                <CardContent className="p-0 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-sm text-body">{c.slug}</p>
                  </div>
                  <p className="text-sm text-body text-right">
                    {c.locationsCount} locations · {c.usersCount} users
                    <br />
                    {c.lastReviewAt ? `Last review ${new Date(c.lastReviewAt).toLocaleDateString()}` : "No reviews yet"}
                  </p>
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

- [ ] **Step 4: Client workspace shell**

`admin/clients/[clientId]/client-tabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export function ClientTabs({
  clientId,
  counts,
}: {
  clientId: string;
  counts: { locations: number; users: number };
}) {
  const pathname = usePathname();
  const base = `/dashboard/admin/clients/${clientId}`;
  const tabs = [
    { href: base, label: "Summary" },
    { href: `${base}/locations`, label: `Locations (${counts.locations})` },
    { href: `${base}/users`, label: `Users (${counts.users})` },
    { href: `${base}/reviews`, label: "Reviews" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav aria-label="Client sections" className="flex gap-1 overflow-x-auto border-b border-cool">
      {tabs.map((tab) => {
        const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              active ? "border-ink text-ink" : "border-transparent text-body hover:text-ink"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

`admin/clients/[clientId]/layout.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/app/dashboard/(protected)/page-header";
import { ClientTabs } from "./client-tabs";

export const dynamic = "force-dynamic";

export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  await requireSuperadmin();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const [clientRes, locationsRes, usersRes] = await Promise.all([
    admin.from("clients").select("id, name, slug").eq("id", clientId).maybeSingle(),
    admin.from("locations").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("client_id", clientId),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (locationsRes.error) throw locationsRes.error;
  if (usersRes.error) throw usersRes.error;
  if (!clientRes.data) notFound();
  const client = clientRes.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={client.name}
        description={`Slug: ${client.slug}`}
        actions={
          <Link href="/dashboard/admin/clients">
            <Button variant="outline" size="sm">All clients</Button>
          </Link>
        }
      />
      <ClientTabs
        clientId={client.id}
        counts={{ locations: locationsRes.count ?? 0, users: usersRes.count ?? 0 }}
      />
      {children}
    </div>
  );
}
```

`admin/clients/[clientId]/page.tsx` (Summary):

```tsx
import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { loadOverviewData } from "@/lib/dashboard-data";
import { describeLocationScope } from "@/lib/location-label";
import { OverviewView } from "@/components/dashboard/overview-view";
import { LocationFilter } from "@/app/dashboard/(protected)/location-filter";

export const dynamic = "force-dynamic";

export default async function ClientSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  await requireSuperadmin();
  const { clientId } = await params;
  const { location } = await searchParams;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const { data: locations, error } = await admin.from("locations").select("id, name").eq("client_id", clientId);
  if (error) throw error;

  // A location id from another client matches nothing: the loader also filters by client_id.
  const data = await loadOverviewData(admin, { clientId, locationId: location });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-body">{describeLocationScope("admin", location, locations ?? [])}</p>
        {(locations ?? []).length > 0 && <LocationFilter locations={locations ?? []} />}
      </div>
      <OverviewView data={data} />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test && npx eslint "app/dashboard/(protected)" components lib`
Expected: clean. The old `admin/[clientId]` route still exists until Task 4 (its page imports `../create-client-form`? it does not; if any old file imports the moved `create-client-form`, fix that import in Task 4). If tsc fails only because the old route breaks, note it and fix in Task 4 rather than reordering.

- [ ] **Step 6: Commit**

```bash
git add -A "app/dashboard/(protected)/admin" "app/dashboard/(protected)/sidebar.tsx"
git commit -m "feat: agency overview, clients list and client workspace shell

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Locations, Users and Reviews tabs; remove the old route

**Files:**
- Move (`git mv`, then fix imports): `admin/[clientId]/create-location-form.tsx` and `location-qr.tsx` → `admin/clients/[clientId]/locations/`; `create-user-form.tsx` and `user-row.tsx` → `admin/clients/[clientId]/users/`
- Create: `admin/clients/[clientId]/locations/page.tsx`, `users/page.tsx`, `reviews/page.tsx`
- Delete: `admin/[clientId]/page.tsx` (and the now-empty `admin/[clientId]` directory)
- Modify: `admin/actions.ts` (`revalidatePath` targets)

**Interfaces:**
- Consumes: Task 3 layout (provides header/tabs and validates `clientId`), `loadReviewsPage` (Task 1), existing `LocationQr`, `CreateLocationForm`, `CreateUserForm`, `UserRow`, `ConfirmSubmitButton`, `deleteLocationAction`, `ReviewsTable`, `ReviewsPager`, `LocationFilter`.
- Produces: routes `…/locations`, `…/users`, `…/reviews`.

- [ ] **Step 1: Move files**

```bash
cd "app/dashboard/(protected)/admin"
mkdir -p "clients/[clientId]/locations" "clients/[clientId]/users" "clients/[clientId]/reviews"
git mv "[clientId]/create-location-form.tsx" "clients/[clientId]/locations/create-location-form.tsx"
git mv "[clientId]/location-qr.tsx" "clients/[clientId]/locations/location-qr.tsx"
git mv "[clientId]/create-user-form.tsx" "clients/[clientId]/users/create-user-form.tsx"
git mv "[clientId]/user-row.tsx" "clients/[clientId]/users/user-row.tsx"
```

In the moved files, fix relative imports that pointed one level up: `from "../actions"` stays `from "../actions"` ONLY if it still resolves; the new location is three levels below `admin/`, so replace with `"@/app/dashboard/(protected)/admin/actions"` and `"../credentials-notice"` with `"@/app/dashboard/(protected)/admin/credentials-notice"` in `create-user-form.tsx` and `user-row.tsx`; `create-location-form.tsx` imports `"../actions"` → `"@/app/dashboard/(protected)/admin/actions"`.

- [ ] **Step 2: Locations page** `clients/[clientId]/locations/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { getSiteUrl } from "@/lib/site-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/app/dashboard/(protected)/admin/confirm-submit-button";
import { deleteLocationAction } from "@/app/dashboard/(protected)/admin/actions";
import { CreateLocationForm } from "./create-location-form";
import { LocationQr } from "./location-qr";

export const dynamic = "force-dynamic";

export default async function ClientLocationsPage({ params }: { params: Promise<{ clientId: string }> }) {
  await requireSuperadmin();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const [clientRes, locationsRes] = await Promise.all([
    admin.from("clients").select("id, slug").eq("id", clientId).maybeSingle(),
    admin
      .from("locations")
      .select("id, name, slug, google_review_url")
      .eq("client_id", clientId)
      .order("name"),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (locationsRes.error) throw locationsRes.error;
  if (!clientRes.data) notFound();
  const client = clientRes.data;
  const locations = locationsRes.data ?? [];
  const siteUrl = getSiteUrl();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add location</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateLocationForm clientId={client.id} clientSlug={client.slug} />
        </CardContent>
      </Card>

      {locations.length === 0 ? (
        <p className="text-sm text-body">No locations yet. Add the first one above to get its QR code.</p>
      ) : (
        locations.map((l) => (
          <Card key={l.id} size="sm" className="p-4">
            <CardContent className="p-0 flex items-center gap-4">
              <div className="flex-1 flex flex-col gap-3">
                <p className="font-medium text-ink">{l.name}</p>
                <LocationQr baseUrl={siteUrl} slug={l.slug} name={l.name} />
              </div>
              <form action={deleteLocationAction}>
                <input type="hidden" name="locationId" value={l.id} />
                <ConfirmSubmitButton
                  confirmMessage={`Delete location "${l.name}"? This also deletes all of its reviews and scans. This cannot be undone.`}
                  ariaLabel={`Delete ${l.name}`}
                >
                  Delete
                </ConfirmSubmitButton>
              </form>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
```

(Task 5 adds the edit form to each location card.)

- [ ] **Step 3: Users page** `clients/[clientId]/users/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateUserForm } from "./create-user-form";
import { UserRow } from "./user-row";

export const dynamic = "force-dynamic";

export default async function ClientUsersPage({ params }: { params: Promise<{ clientId: string }> }) {
  await requireSuperadmin();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const [clientRes, locationsRes, profilesRes] = await Promise.all([
    admin.from("clients").select("id").eq("id", clientId).maybeSingle(),
    admin.from("locations").select("id, name").eq("client_id", clientId).order("name"),
    admin.from("profiles").select("id, role, location_id").eq("client_id", clientId),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (locationsRes.error) throw locationsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (!clientRes.data) notFound();

  const locations = locationsRes.data ?? [];
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));
  const users = await Promise.all(
    (profilesRes.data ?? []).map(async (p) => {
      const { data, error } = await admin.auth.admin.getUserById(p.id);
      if (error) throw error;
      return {
        id: p.id,
        role: p.role as string,
        email: data.user?.email ?? "(unknown)",
        locationName: p.location_id ? (locationNames.get(p.location_id) ?? null) : null,
      };
    })
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add user</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm clientId={clientId} locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
        </CardContent>
      </Card>

      {users.length === 0 ? (
        <p className="text-sm text-body">No users yet. Create the client&apos;s first admin above.</p>
      ) : (
        users.map((u) => <UserRow key={u.id} user={u} />)
      )}
    </div>
  );
}
```

- [ ] **Step 4: Reviews page** `clients/[clientId]/reviews/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { loadReviewsPage } from "@/lib/dashboard-data";
import { ReviewsTable } from "@/app/dashboard/(protected)/reviews/reviews-table";
import { ReviewsPager } from "@/app/dashboard/(protected)/reviews/pager";
import { LocationFilter } from "@/app/dashboard/(protected)/location-filter";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

export default async function ClientReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ location?: string; classification?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireSuperadmin();
  const { clientId } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const { data: locations, error } = await admin.from("locations").select("id, name").eq("client_id", clientId);
  if (error) throw error;

  const page = Math.max(1, Number(sp.page) || 1);
  const { reviews, totalPages } = await loadReviewsPage(admin, {
    clientId,
    locationId: sp.location,
    classification: sp.classification,
    from: sp.from,
    to: sp.to,
    page,
    pageSize: PAGE_SIZE,
  });

  function buildHref(targetPage: number): string {
    const search = new URLSearchParams();
    if (sp.location) search.set("location", sp.location);
    if (sp.classification) search.set("classification", sp.classification);
    if (sp.from) search.set("from", sp.from);
    if (sp.to) search.set("to", sp.to);
    search.set("page", String(targetPage));
    return `?${search.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {(locations ?? []).length > 0 && (
        <div className="flex justify-end">
          <LocationFilter locations={locations ?? []} />
        </div>
      )}
      {reviews.length === 0 ? (
        <p className="text-sm text-body">No reviews match these filters.</p>
      ) : (
        <ReviewsTable reviews={reviews} fillTo={PAGE_SIZE} />
      )}
      <ReviewsPager page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
```

- [ ] **Step 5: Remove the old route and fix revalidation**

```bash
git rm "app/dashboard/(protected)/admin/[clientId]/page.tsx"
```

(Delete any other leftover file in `admin/[clientId]/`; the directory must disappear.) In `admin/actions.ts`:
- `createLocationAction`: `revalidatePath(`${ADMIN_PATH}/clients/${clientId}`, "layout");`
- `createUserAction`: same call with its `clientId`.
- `deleteUserAction` and `deleteLocationAction`: keep `revalidatePath(ADMIN_PATH, "layout")`.
- `createClientAction`: `revalidatePath(`${ADMIN_PATH}/clients`)` plus `revalidatePath(ADMIN_PATH)`.

Run `grep -rn "dashboard/admin/\${" app lib components` and `grep -rn "admin/\[clientId\]" app lib components tests docs README.md`: no remaining reference to the old route may exist (docs under `docs/superpowers/` excluded).

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm test && npx eslint "app/dashboard/(protected)" components lib tests`
Expected: clean; the existing 92+ tests (including `tests/admin-actions.test.ts`) pass.

```bash
git add -A "app/dashboard/(protected)/admin"
git commit -m "feat: locations, users and reviews tabs per client; remove old client page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Manage client data (update client/location, delete client) and Settings tab

**Files:**
- Modify: `lib/validation.ts` (append schemas)
- Modify: `app/dashboard/(protected)/admin/actions.ts` (append three actions)
- Create: `app/dashboard/(protected)/admin/clients/[clientId]/settings/page.tsx`, `rename-client-form.tsx`, `delete-client-form.tsx`
- Create: `app/dashboard/(protected)/admin/clients/[clientId]/locations/edit-location-form.tsx`
- Modify: `…/locations/page.tsx` (render the edit form in each location card)
- Test: `tests/admin-management-actions.test.ts`, append to `tests/validation.test.ts`

**Interfaces:**
- Consumes: `requireSuperadmin`, `createAdminClient`, `describeDbError`, `ActionResult`, `clientFormSchema`, `locationFormSchema`, `userIdSchema`.
- Produces:
  - Zod: `clientUpdateSchema` (`{ clientId, name, slug }`), `locationUpdateSchema` (`{ locationId, name, googleReviewUrl }`, no slug), `clientDeleteSchema` (`{ clientId, confirmSlug }`)
  - `updateClientAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult>`
  - `updateLocationAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult>`
  - `deleteClientAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult>` (redirects to `/dashboard/admin/clients` on success)

- [ ] **Step 1: Write failing tests**

Append to `tests/validation.test.ts` (extend its import from `@/lib/validation` with the three new schema names):

```ts
describe("clientUpdateSchema", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  it("normalizes the slug", () => {
    expect(clientUpdateSchema.parse({ clientId, name: " Acme ", slug: "ACME-Co" })).toEqual({
      clientId,
      name: "Acme",
      slug: "acme-co",
    });
  });
  it("rejects a non-uuid client id", () => {
    expect(clientUpdateSchema.safeParse({ clientId: "x", name: "A", slug: "a" }).success).toBe(false);
  });
});

describe("locationUpdateSchema", () => {
  const locationId = "22222222-2222-4222-8222-222222222222";
  it("accepts name and review link, and strips any slug", () => {
    const parsed = locationUpdateSchema.parse({
      locationId,
      name: "Centro",
      googleReviewUrl: "https://g.page/r/X/review",
      slug: "hacked",
    });
    expect(parsed).toEqual({ locationId, name: "Centro", googleReviewUrl: "https://g.page/r/X/review" });
    expect("slug" in parsed).toBe(false);
  });
  it("turns an empty review link into null", () => {
    expect(locationUpdateSchema.parse({ locationId, name: "Centro", googleReviewUrl: "" }).googleReviewUrl).toBeNull();
  });
});

describe("clientDeleteSchema", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  it("lowercases and trims the confirmation slug", () => {
    expect(clientDeleteSchema.parse({ clientId, confirmSlug: "  Acme " }).confirmSlug).toBe("acme");
  });
});
```

Create `tests/admin-management-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/superadmin", () => ({ requireSuperadmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteClientAction,
  updateClientAction,
  updateLocationAction,
} from "@/app/dashboard/(protected)/admin/actions";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const USER_A = "33333333-3333-4333-8333-333333333333";
const USER_B = "44444444-4444-4444-8444-444444444444";

function fd(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

type DbError = { code: string; message: string } | null;

function fakeAdmin(
  cfg: {
    clientSlug?: string | null;
    profileIds?: string[];
    deleteUserFailsFor?: string;
    clientDeleteError?: DbError;
    clientUpdateError?: DbError;
    locationClientId?: string | null;
    locationUpdateError?: DbError;
  } = {}
) {
  const events: string[] = [];
  const updates: { table: string; payload: unknown }[] = [];

  const from = (table: string) => {
    let op = "select";
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      delete: () => {
        op = "delete";
        return builder;
      },
      update: (payload: unknown) => {
        op = "update";
        updates.push({ table, payload });
        return builder;
      },
      maybeSingle: async () => {
        if (table === "clients") {
          return { data: cfg.clientSlug === null ? null : { slug: cfg.clientSlug ?? "acme" }, error: null };
        }
        if (table === "locations") {
          return {
            data: cfg.locationClientId === null ? null : { client_id: cfg.locationClientId ?? CLIENT_ID },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === "profiles" && op === "select") {
          return resolve({ data: (cfg.profileIds ?? []).map((id) => ({ id })), error: null });
        }
        if (table === "clients" && op === "delete") {
          events.push("delete:client");
          return resolve({ error: cfg.clientDeleteError ?? null });
        }
        if (table === "clients" && op === "update") return resolve({ error: cfg.clientUpdateError ?? null });
        if (table === "locations" && op === "update") return resolve({ error: cfg.locationUpdateError ?? null });
        return resolve({ data: [], error: null });
      },
    };
    return builder;
  };

  const deleteUser = vi.fn(async (id: string) => {
    events.push(`deleteUser:${id}`);
    return { error: cfg.deleteUserFailsFor === id ? { message: "boom" } : null };
  });

  vi.mocked(createAdminClient).mockReturnValue({
    from,
    auth: { admin: { deleteUser } },
  } as unknown as ReturnType<typeof createAdminClient>);
  return { events, updates, deleteUser };
}

describe("agency management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperadmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireSuperadmin>>);
  });

  it("rejects non-superadmins before creating the admin client", async () => {
    vi.mocked(requireSuperadmin).mockRejectedValue(new Error("Forbidden"));
    await expect(updateClientAction(null, fd({ clientId: CLIENT_ID, name: "A", slug: "a" }))).rejects.toThrow("Forbidden");
    await expect(updateLocationAction(null, fd({ locationId: LOCATION_ID, name: "A" }))).rejects.toThrow("Forbidden");
    await expect(deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "acme" }))).rejects.toThrow("Forbidden");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("renames a client and maps a duplicate slug to a readable message", async () => {
    const ok = fakeAdmin();
    expect(await updateClientAction(null, fd({ clientId: CLIENT_ID, name: "Acme 2", slug: "Acme-2" }))).toEqual({
      ok: true,
      data: null,
    });
    expect(ok.updates).toEqual([{ table: "clients", payload: { name: "Acme 2", slug: "acme-2" } }]);

    fakeAdmin({ clientUpdateError: { code: "23505", message: 'duplicate key "clients_slug_key"' } });
    expect(await updateClientAction(null, fd({ clientId: CLIENT_ID, name: "Acme 2", slug: "taken" }))).toEqual({
      ok: false,
      error: "That slug is already in use. Choose a different one.",
    });
  });

  it("updates a location's name and review link but never its slug", async () => {
    const admin = fakeAdmin();
    const result = await updateLocationAction(
      null,
      fd({ locationId: LOCATION_ID, name: "Centro", googleReviewUrl: "https://g.page/r/X/review", slug: "hacked" })
    );
    expect(result).toEqual({ ok: true, data: null });
    expect(admin.updates).toEqual([
      { table: "locations", payload: { name: "Centro", google_review_url: "https://g.page/r/X/review" } },
    ]);
  });

  it("fails cleanly for an unknown location", async () => {
    const admin = fakeAdmin({ locationClientId: null });
    const result = await updateLocationAction(null, fd({ locationId: LOCATION_ID, name: "Centro" }));
    expect(result).toEqual({ ok: false, error: "Location not found." });
    expect(admin.updates).toEqual([]);
  });

  it("refuses to delete a client when the confirmation slug is wrong", async () => {
    const admin = fakeAdmin({ clientSlug: "acme", profileIds: [USER_A] });
    const result = await deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "nope" }));
    expect(result).toEqual({ ok: false, error: "Type the client slug exactly to confirm." });
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(admin.events).toEqual([]);
  });

  it("deletes the client's users before the client, then redirects", async () => {
    const admin = fakeAdmin({ clientSlug: "acme", profileIds: [USER_A, USER_B] });
    await expect(deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "ACME" }))).rejects.toThrow(
      "REDIRECT:/dashboard/admin/clients"
    );
    expect(admin.events).toEqual([`deleteUser:${USER_A}`, `deleteUser:${USER_B}`, "delete:client"]);
  });

  it("does not delete the client if a user deletion fails", async () => {
    const admin = fakeAdmin({ clientSlug: "acme", profileIds: [USER_A, USER_B], deleteUserFailsFor: USER_B });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "acme" }));
    expect(result.ok).toBe(false);
    expect(admin.events).not.toContain("delete:client");
  });

  it("reports an unknown client", async () => {
    fakeAdmin({ clientSlug: null });
    expect(await deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "acme" }))).toEqual({
      ok: false,
      error: "Client not found.",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/admin-management-actions.test.ts tests/validation.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 3: Schemas** — append to `lib/validation.ts`:

```ts
export const clientUpdateSchema = clientFormSchema.extend({ clientId: z.uuid() });

export const locationUpdateSchema = locationFormSchema
  .pick({ name: true, googleReviewUrl: true })
  .extend({ locationId: z.uuid() });

export const clientDeleteSchema = z.object({
  clientId: z.uuid(),
  confirmSlug: z
    .string()
    .trim()
    .max(100)
    .transform((v) => v.toLowerCase()),
});
```

- [ ] **Step 4: Actions** — in `admin/actions.ts` add `import { redirect } from "next/navigation";`, extend the validation import with `clientUpdateSchema, locationUpdateSchema, clientDeleteSchema`, and append:

```ts
export async function updateClientAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = clientUpdateSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid client.");

  const { clientId, name, slug } = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin.from("clients").update({ name, slug }).eq("id", clientId);
  if (error) return fail(describeDbError(error, "Could not update client."));

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true, data: null };
}

export async function updateLocationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = locationUpdateSchema.safeParse({
    locationId: formData.get("locationId"),
    name: formData.get("name"),
    googleReviewUrl: formData.get("googleReviewUrl") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid location.");

  const { locationId, name, googleReviewUrl } = parsed.data;
  const admin = createAdminClient();
  const { data: location } = await admin.from("locations").select("client_id").eq("id", locationId).maybeSingle();
  if (!location) return fail("Location not found.");

  // The slug is deliberately not updatable: printed QR codes point at it.
  const { error } = await admin
    .from("locations")
    .update({ name, google_review_url: googleReviewUrl })
    .eq("id", locationId);
  if (error) return fail(describeDbError(error, "Could not update location."));

  revalidatePath(`${ADMIN_PATH}/clients/${location.client_id}`, "layout");
  return { ok: true, data: null };
}

export async function deleteClientAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = clientDeleteSchema.safeParse({
    clientId: formData.get("clientId"),
    confirmSlug: formData.get("confirmSlug") ?? "",
  });
  if (!parsed.success) return fail("Invalid request.");

  const { clientId, confirmSlug } = parsed.data;
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("slug").eq("id", clientId).maybeSingle();
  if (!client) return fail("Client not found.");
  if (confirmSlug !== client.slug) return fail("Type the client slug exactly to confirm.");

  // Remove the logins first: deleting the client row would orphan them.
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .eq("client_id", clientId);
  if (profilesError) return fail("Could not read the client's users.");

  for (const profile of profiles ?? []) {
    const { error } = await admin.auth.admin.deleteUser(profile.id);
    if (error) {
      console.error("deleteClientAction: could not delete user", profile.id, error.message);
      return fail("Could not delete one of the client's users. The client was not deleted.");
    }
  }

  const { error: deleteError } = await admin.from("clients").delete().eq("id", clientId);
  if (deleteError) return fail(describeDbError(deleteError, "Could not delete client."));

  revalidatePath(ADMIN_PATH, "layout");
  redirect(`${ADMIN_PATH}/clients`);
}
```

(`redirect` throws, so the function's return type stays `Promise<ActionResult>`; TypeScript accepts it because `redirect` returns `never`.)

- [ ] **Step 5: Settings tab and edit form**

`settings/rename-client-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClientAction } from "@/app/dashboard/(protected)/admin/actions";

export function RenameClientForm({ clientId, name, slug }: { clientId: string; name: string; slug: string }) {
  const [state, formAction, pending] = useActionState(updateClientAction, null);

  return (
    <form action={formAction} className="flex gap-3 flex-wrap items-end">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name">Name</Label>
        <Input id="client-name" name="name" defaultValue={name} required className="w-56" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-slug">Slug</Label>
        <Input id="client-slug" name="slug" defaultValue={slug} required className="w-56" />
      </div>
      <Button type="submit" disabled={pending}>Save</Button>
      {state && !state.ok && <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="w-full text-sm text-body">Saved.</p>}
    </form>
  );
}
```

`settings/delete-client-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteClientAction } from "@/app/dashboard/(protected)/admin/actions";

export function DeleteClientForm({ clientId, slug }: { clientId: string; slug: string }) {
  const [state, formAction, pending] = useActionState(deleteClientAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-sm text-body">
        This permanently deletes the client, its locations, reviews, scans and every user login. To confirm, type{" "}
        <span className="font-mono text-ink">{slug}</span>.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-slug">Client slug</Label>
        <Input id="confirm-slug" name="confirmSlug" autoComplete="off" required />
      </div>
      <div>
        <Button type="submit" variant="destructive" disabled={pending}>Delete client</Button>
      </div>
      {state && !state.ok && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
```

If `components/ui/button.tsx` has no `destructive` variant, use `variant="outline"` with the class `text-red-600` instead; check the file first.

`settings/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteClientForm } from "./delete-client-form";
import { RenameClientForm } from "./rename-client-form";

export const dynamic = "force-dynamic";

export default async function ClientSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  await requireSuperadmin();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const { data: client, error } = await admin.from("clients").select("id, name, slug").eq("id", clientId).maybeSingle();
  if (error) throw error;
  if (!client) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Client details</CardTitle>
        </CardHeader>
        <CardContent>
          <RenameClientForm clientId={client.id} name={client.name} slug={client.slug} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Delete client</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteClientForm clientId={client.id} slug={client.slug} />
        </CardContent>
      </Card>
    </div>
  );
}
```

`locations/edit-location-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLocationAction } from "@/app/dashboard/(protected)/admin/actions";

export function EditLocationForm({
  locationId,
  name,
  googleReviewUrl,
}: {
  locationId: string;
  name: string;
  googleReviewUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateLocationAction, null);

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-body hover:text-ink">Edit</summary>
      <form action={formAction} className="mt-3 flex gap-3 flex-wrap items-end">
        <input type="hidden" name="locationId" value={locationId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${locationId}`}>Name</Label>
          <Input id={`name-${locationId}`} name="name" defaultValue={name} required className="w-48" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`url-${locationId}`}>Google review link</Label>
          <Input
            id={`url-${locationId}`}
            name="googleReviewUrl"
            defaultValue={googleReviewUrl ?? ""}
            placeholder="https://g.page/r/XXXX/review"
            className="w-64"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>Save</Button>
        {state && !state.ok && <p role="alert" className="w-full text-red-600">{state.error}</p>}
        {state?.ok && <p role="status" className="w-full text-body">Saved.</p>}
      </form>
    </details>
  );
}
```

In `locations/page.tsx` add `import { EditLocationForm } from "./edit-location-form";` and, inside each location's left column right after `<LocationQr … />`, add:

```tsx
                <EditLocationForm locationId={l.id} name={l.name} googleReviewUrl={l.google_review_url} />
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npx vitest run tests/admin-management-actions.test.ts tests/validation.test.ts && npx tsc --noEmit && npm test && npx eslint "app/dashboard/(protected)" lib tests components`
Expected: all green, test output pristine.

- [ ] **Step 7: Commit**

```bash
git add -A lib tests "app/dashboard/(protected)/admin"
git commit -m "feat: edit clients and locations, delete client with typed confirmation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Final verification and docs

**Files:**
- Modify: `README.md` (agency routes), `docs/superpowers/specs/2026-10-09-agency-panel-restructure-design.md` (note the deviation if any)

- [ ] **Step 1: README** — in the "Multi-tenant operations" section replace the "Onboarding a client" paragraph with:

```markdown
### Onboarding a client
Log in as superadmin. `/dashboard/admin` is the agency Overview and `/dashboard/admin/clients` lists the clients. Create the client, open it, then use its tabs: **Locations** (add locations and download their QR codes; slugs are globally unique, so prefix them with the client slug), **Users** (create the client's admin and hand over the generated password), **Reviews** (read-only), **Settings** (rename or delete the client).
```

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm test && npx next build --webpack`
Expected: all green. Then run `grep -rn "admin/\[clientId\]\|dashboard/admin/\${clientId}\|dashboard/admin/\${c.id}" app lib components` and confirm no match (new links must be `/dashboard/admin/clients/...`).

- [ ] **Step 3: Commit**

```bash
git add README.md docs
git commit -m "docs: agency panel routes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Manual verification (operator, needs a live database)**

1. As superadmin: Overview shows totals; Clients lists clients with counts; search filters.
2. Open a client: Summary, Locations (QR, edit, delete with confirm), Users (create, reset, delete), Reviews (filter by location, paging), Settings (rename; wrong slug on delete is refused).
3. As a client admin and as a manager: Overview and Reviews look and behave exactly as before; `/dashboard/admin/clients` redirects away.
4. Open `/dashboard/admin/clients/<clientA>?location=<locationOfClientB>`: Summary shows no data for A (nothing from B).
