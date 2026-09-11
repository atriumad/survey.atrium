# Metricas → Overview page rework

## Context

The dashboard's "Metricas" page (`app/dashboard/(protected)/page.tsx`) reads as
scattered: 6 `MetricCard`s sit in one flat grid with no grouping (Total
reviews, Rating promedio, %Buenas, %Compartidas a Google, Escaneos QR,
Conversion all carry equal visual weight), followed by a star-distribution
chart under its own ad-hoc `<h2>` that doesn't match the eyebrow pattern
already established on the Config page
(`text-xs uppercase tracking-wide font-semibold text-body`). There's no
activity table — a manager or admin has no fast way to see "what happened
recently" without leaving for the separate Reviews page.

The page is renamed to "Overview," framed as a glance at current status
across the client's locations, with a details section underneath for the
last 24 hours of activity. The separate Reviews page stays as-is (already
specific/filterable — out of scope for this change).

## Scope decisions (from Q&A)

- **No per-location breakdown table.** When an admin views all locations
  (no filter), Overview still shows aggregate totals only, same as today.
  The existing `LocationFilter` already lets an admin narrow to one
  location — that's the mechanism for a per-location view, not a new table.
- **The 24h table reuses the existing `ReviewsTable` component as-is** (Fecha
  / Rating / Clasificacion / Comentario) — no new `Location` column, even
  though Overview can show reviews from multiple locations when unfiltered.
- **Metrics are grouped into two labeled clusters**, each with an eyebrow
  heading matching Config's pattern:
  - **Actividad**: Total reviews, Escaneos QR, Conversion
  - **Calidad**: Rating promedio, % Buenas, % Compartidas a Google
- **Page order**: Header ("Overview") → metric clusters → star distribution
  → 24h activity table (general → specific, detail last).

## Changes

### 1. Rename + reorder (`app/dashboard/(protected)/page.tsx`)

- `PageHeader title="Overview"` (was "Metricas"). No description needed —
  the two section eyebrows below already communicate structure.
- The single `grid grid-cols-2 md:grid-cols-4 gap-4` becomes two blocks,
  each with its own eyebrow + its own grid:
  ```tsx
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
  ```
  (3-column grid fits 3 cards per cluster cleanly; collapses via existing
  responsive conventions — same breakpoint approach as the rest of the app.)
- The star-distribution block's ad-hoc `<h2 className="text-xl font-medium
  text-ink mb-3">` becomes the same eyebrow style as the two clusters above
  it, for visual consistency across the whole page.

### 2. Last-24h activity table (new)

- Query: same `reviews` table, same `client_id`/`effectiveLocation` scoping
  already used for the metrics query on this page, plus a
  `created_at >= <24h ago ISO string>` filter, ordered
  `created_at desc` (newest first) — same ordering convention as the
  Reviews page.
- Render with the existing `ReviewsTable` component (imported from
  `../reviews/reviews-table`), unmodified — it already has its own empty
  state ("Sin reviews todavia.").
- Section gets its own eyebrow: "Ultimas 24 horas".
- No new export button here — CSV export stays exclusive to the full
  Reviews page (this is a glance, not another place to manage data).

### 3. Sidebar label

`app/dashboard/(protected)/sidebar.tsx`'s `NAV_ITEMS` has
`{ href: "/dashboard", label: "Metricas" }` — becomes
`{ href: "/dashboard", label: "Overview" }`. Route is unchanged
(`/dashboard`), only the link text.

## Out of scope

- Per-location breakdown table (explicitly declined above).
- Any change to the Reviews page itself, `ReviewsTable`'s columns, or the
  `qr_scans`/conversion-rate calculation logic — this is a layout/grouping
  and one-new-query change, no business logic changes elsewhere.

## Testing

No new business logic beyond a date-range filter on an existing query
pattern (already proven on the Reviews page, which does the same
`gte`/`lte` filtering) — no new unit tests needed. Verification is
`bunx tsc --noEmit`, `bun run build`, and a manual pass: confirm both
metric clusters render with their eyebrows, the star-distribution heading
matches the same style, and the 24h table shows only reviews from the last
24 hours (or the empty state if none).
