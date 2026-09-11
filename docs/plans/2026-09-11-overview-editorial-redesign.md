# Overview Editorial Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Overview's flat metric-card grid with a single dark editorial hero panel (rating promedio as the headline stat + a tier word + secondary stats), and rework the star-distribution chart into horizontal bars with explicit counts and percents.

**Architecture:** One new pure helper (`describeAverageRating`) added to `lib/metrics.ts` with unit tests (TDD), one new Tailwind color token (`--color-line-inverse`) added to `app/globals.css`, and a full rewrite of the Overview page's JSX in `app/dashboard/(protected)/page.tsx` — no new components, no new queries, all data already computed on that page today.

**Tech Stack:** Next.js 16 (Server Components), Tailwind v4 `@theme` tokens, vitest/bun test.

---

### Task 1: `describeAverageRating` helper (TDD)

**Files:**
- Modify: `lib/metrics.ts`
- Test: `tests/metrics.test.ts`

**Step 1: Write the failing tests**

Append to `tests/metrics.test.ts` (after the existing `calculateConversionRate` describe block):

```ts
import { describeAverageRating } from "@/lib/metrics";

describe("describeAverageRating", () => {
  it("returns 'Sin datos aun' when there are no reviews", () => {
    expect(describeAverageRating(0, 0)).toBe("Sin datos aun");
  });

  it("returns 'Excelente' at 4.5 and above", () => {
    expect(describeAverageRating(4.5, 10)).toBe("Excelente");
    expect(describeAverageRating(5, 10)).toBe("Excelente");
  });

  it("returns 'Muy bien' between 4.0 and 4.49", () => {
    expect(describeAverageRating(4.2, 10)).toBe("Muy bien");
  });

  it("returns 'Regular' between 3.0 and 3.99", () => {
    expect(describeAverageRating(3.1, 10)).toBe("Regular");
  });

  it("returns 'A mejorar' below 3.0", () => {
    expect(describeAverageRating(2.4, 10)).toBe("A mejorar");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/metrics.test.ts`
Expected: FAIL — `describeAverageRating is not a function` (or not exported).

**Step 3: Implement the function**

Append to `lib/metrics.ts` (after the existing `calculateConversionRate` function):

```ts
export function describeAverageRating(averageRating: number, total: number): string {
  if (total === 0) return "Sin datos aun";
  if (averageRating >= 4.5) return "Excelente";
  if (averageRating >= 4) return "Muy bien";
  if (averageRating >= 3) return "Regular";
  return "A mejorar";
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/metrics.test.ts`
Expected: PASS, all tests in the file green.

**Step 5: Commit**

```bash
git add lib/metrics.ts tests/metrics.test.ts
git commit -m "feat: add describeAverageRating tier helper for Overview hero"
```

---

### Task 2: Add `--color-line-inverse` token

**Files:**
- Modify: `app/globals.css`

**Step 1: Add the token**

In `app/globals.css`, find the `@theme inline` block's color declarations
(the group starting with `--color-cream: #F3EFE4;`). Add one new line
right after `--color-cool: #E4EEF0;`:

```css
  --color-cool: #E4EEF0;
  --color-line-inverse: rgba(243, 239, 228, 0.2);
```

(This is cream at 20% opacity — the brand sheet's `--line-inverse` token,
used for hairline dividers on a dark background. It has no light-mode
equivalent needed here since it's only ever used on the `ink` background.)

**Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors (CSS-only change, but confirms nothing else broke).

**Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add line-inverse color token for dark-panel dividers"
```

---

### Task 3: Overview page — editorial hero + horizontal star bars

**Files:**
- Modify: `app/dashboard/(protected)/page.tsx`

**Step 1: Rewrite the page**

Read the current file first — confirm it still matches the version below
(it was last touched by the previous "Metricas → Overview" plan; if it has
drifted, adapt this task's replacement to preserve any changes you can't
explain, and flag it in your report). Replace the entire file with:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { summarizeReviews, calculateConversionRate, describeAverageRating } from "@/lib/metrics";
import { LocationFilter } from "./location-filter";
import { PageHeader } from "./page-header";
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
  const ratingTier = describeAverageRating(summary.averageRating, summary.total);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let recentQuery = supabase
    .from("reviews")
    .select("*")
    .eq("client_id", profile.clientId)
    .gte("created_at", twentyFourHoursAgo)
    .order("created_at", { ascending: false });
  if (effectiveLocation) recentQuery = recentQuery.eq("location_id", effectiveLocation);
  const { data: recentReviews } = await recentQuery;

  const secondaryStats: { label: string; value: string | number }[] = [
    { label: "Total reviews", value: summary.total },
    { label: "% Buenas", value: `${summary.goodPercent}%` },
    { label: "% Compartidas a Google", value: `${summary.sharedPercent}%` },
    { label: "Escaneos QR", value: scansTotal ?? 0 },
    { label: "Conversion", value: conversionRate === null ? "—" : `${conversionRate}%` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        actions={profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      />

      <div className="relative overflow-hidden rounded-[26px] bg-ink p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -inset-x-10 -top-20 h-64"
          style={{
            background:
              "radial-gradient(50% 60% at 70% 20%, color-mix(in srgb, var(--color-lime) 45%, transparent) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex flex-col gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-lime font-semibold">
              Rating promedio
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-3 text-6xl sm:text-7xl font-normal tracking-tight text-cream">
              {summary.total > 0 ? summary.averageRating.toFixed(1) : "—"}
              <em className="font-serif italic text-lime text-3xl sm:text-4xl not-italic:font-serif">
                {ratingTier}
              </em>
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-4 border-t border-line-inverse pt-6">
            {secondaryStats.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-wide text-lime/80">{stat.label}</p>
                <p className="text-xl font-medium text-cream">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Distribucion de estrellas</h2>
        <div className="rounded-[26px] bg-white p-5 shadow-card flex flex-col gap-3">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const count = summary.starDistribution[star];
            const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-3">
                <span className="w-8 text-sm font-medium text-ink shrink-0">{star}★</span>
                <div className="flex-1 h-3 rounded-full bg-cool overflow-hidden">
                  <div
                    className={`h-full rounded-full ${star <= 3 ? "bg-amber" : "bg-green-fill"}`}
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
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Ultimas 24 horas</h2>
        <ReviewsTable reviews={(recentReviews ?? []) as Review[]} />
      </div>
    </div>
  );
}
```

Notes on this rewrite:
- `MetricCard` and the `Card`/`CardContent` import are removed entirely —
  nothing on this page uses a white metric card anymore (the two clusters
  are gone, folded into the hero's `secondaryStats` row).
- `describeAverageRating` import added from `@/lib/metrics` (Task 1).
- The hero's radial glow uses an inline `style` with `color-mix()` (a plain
  CSS function, no Tailwind arbitrary-value gymnastics needed) — this
  matches how the brand sheet itself builds its glow, just inlined here
  since it's a one-off decorative layer, not a reusable utility.
- `border-line-inverse` relies on the token added in Task 2 — if you do
  Task 2 first (as ordered), this will already resolve correctly.
- Star order is now `[5, 4, 3, 2, 1]` (descending), matching the approved
  preview layout (5★ on top).
- `not-italic:font-serif` on the `<em>` is defensive Tailwind — harmless if
  unnecessary, but guards against any base-layer rule un-italicizing `em`
  in this project's Tailwind reset; the actual italic look comes from the
  `italic` class regardless.

**Step 2: Typecheck and build**

Run: `bunx tsc --noEmit && bun run build`
Expected: no errors. Build output should still list `/dashboard` as a
dynamic route (unchanged route).

**Step 3: Run the full test suite**

Run: `bun test`
Expected: all tests pass, including the new `describeAverageRating` tests
from Task 1.

**Step 4: Manual check**

Run: `bun run dev`, log in, open `/dashboard`. Confirm: the hero renders as
a dark rounded panel with a visible (subtle) lime glow, the rating number
is large with the tier word in serif italic next to it, the 5 secondary
stats show below a hairline divider, and the star-distribution card below
shows 5 horizontal rows (5★ to 1★) each with a filled bar plus
`count (percent%)` text that matches the actual review data.

**Step 5: Commit**

```bash
git add "app/dashboard/(protected)/page.tsx"
git commit -m "feat: redesign Overview as an editorial hero with horizontal star bars"
```
