# Reviews table redesign + Overview hero polish

## Context

The shared `ReviewsTable` component (used on both the full Reviews page
and Overview's "Last 24 hours" section) is missing key columns (email,
location) and shows rating as plain text (`5★`) instead of visual stars.
The full Reviews page has no pagination — it renders every matching
review in one unbounded table. The Overview hero's average-rating panel
works but can be visually tightened, and currently shows only an
all-time number with no sense of recent momentum.

## 1. Table columns + visual star rating

**New column order** (applies to `ReviewsTable` everywhere it's used —
Overview's "Last 24 hours" table and the full Reviews page both get
identical columns; only the full Reviews page adds pagination):

Email | Rating | Classification | Comment | Date | Location

- **Rating** renders as filled/unfilled star icons instead of `{rating}★`
  text — a new reusable `StarRating` component
  (`components/ui/star-rating.tsx`), taking `rating: number` and a `size`
  prop, filling stars amber up to the rounded rating and leaving the rest
  muted. It accepts an optional `mutedClassName` override so it can render
  correctly on both a light background (table) and the dark `ink` hero
  panel (where the light-background muted color would be invisible).
- **Comment** stays `review.comment ?? "—"` (unchanged behavior, just
  reordered).
- **Location** is new: requires joining `locations(name)` into both
  queries that feed `ReviewsTable` (Overview's recent-reviews query and
  the full Reviews page's query), via
  `.select("*, location:locations(name)")`. A new type,
  `ReviewWithLocation` (`Review & { location: { name: string } | null }`),
  is added to `lib/types.ts` for this.

## 2. Pagination (full Reviews page only)

- Fixed page size: **25** reviews per page.
- Navigation: **Previous / Next** buttons plus a "Page X of Y" label —
  no numbered page buttons.
- Fully server-rendered: the Reviews page already reads `searchParams`
  server-side, so it computes `page` (from `searchParams.page`, default
  1), queries with Supabase `.range(from, to)`, and runs a parallel
  `{ count: "exact", head: true }` query (with the same filters) to get
  the total count for `Y` and to disable/hide Next past the last page.
  Prev/Next render as plain `<Link href="?page=N&...">` preserving every
  other active filter (location, classification, from/to) — no client
  component, no extra JS needed.
- **Empty filler rows**: when a page has fewer than 25 real rows (e.g.
  the last page, or a client with few reviews total), the table renders
  additional blank rows (all cells show `—`, no key data) until it
  reaches 25 rows total, so the table's height stays constant across
  pages and reads as a proper fixed-size data grid rather than a shrinking
  card. Overview's "Last 24 hours" table does **not** get filler rows
  (no pagination there, so a variable, honestly-sized table is correct
  for a "glance" section) — filler rows are a prop the full Reviews page
  opts into, not baked into `ReviewsTable` unconditionally.

## 3. Overview hero: stars, spacing, and a trend indicator

- Adds a `StarRating` row directly under/alongside the big average-rating
  number (rounded to the nearest whole star for the fill).
- Re-tightens the internal spacing between the number, the tier word, the
  new star row, and the secondary-stats row below the divider — exact
  values are a presentational judgment call made during implementation,
  not pre-specified here (no new data/logic involved, purely CSS).
- **Trend indicator**: compares the average rating of reviews from the
  last 30 days against the 30 days before that (two additional Supabase
  queries, same `client_id`/`effectiveLocation` scoping already used on
  this page). Shown as a small ▲/▼/→ + delta next to the tier word:
  - ▲ (lime) when the last-30-day average is at least 0.1 higher than the
    prior 30 days
  - ▼ (a muted warm tone, not the destructive red — this is a trend, not
    an error state) when at least 0.1 lower
  - → (muted) when the difference is smaller than 0.1 (effectively flat)
  - **Nothing rendered** if the prior 30-day window has zero reviews —
    there's no baseline to compare against, and showing a fabricated
    "new!" or "—" would overstate what the number means.
  - This trend is explicitly a *different, recency-focused* metric from
    the headline number (which stays all-time, unchanged) — worth being
    visually subordinate (smaller, secondary) so it doesn't read as
    contradicting the big number.

## Out of scope

- Settings redesign and user-profile editing — tracked as a separate,
  later design pass per the client's own sequencing choice.
- Any change to CSV export (still exports all matching rows, not just the
  current page — pagination is a display concern, not a data-export
  limit).
- Numbered page-jump buttons (explicitly declined in favor of Prev/Next).
- Filtering/sorting UI changes beyond what already exists
  (location/classification/date-range filters stay as they are).

## Testing

- Unit tests for the trend-comparison logic (a new small pure helper,
  e.g. `describeRatingTrend(current: number, previous: number, previousCount: number)`
  in `lib/metrics.ts`) covering: up, down, flat, and the
  zero-previous-reviews "no trend" case.
- Unit tests for `StarRating`'s fill-count logic if it's implemented via
  a small pure helper (e.g. rounding rules for partial ratings) —
  otherwise, if it's simple enough to be inline JSX with no branching
  worth isolating, a component snapshot/render test is not required
  (matches this codebase's existing convention of only unit-testing
  extracted pure logic, not JSX structure).
- Manual verification: paginate through a client with more than 25
  reviews (confirm empty filler rows appear on the last page, Prev
  disabled on page 1, Next disabled/hidden on the last page, filters
  persist across page navigation), and confirm the trend indicator's
  three visual states by checking against manually computed 30-day
  averages.
