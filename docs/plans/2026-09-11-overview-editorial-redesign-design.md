# Overview page: editorial hero + clearer star distribution

## Context

The Overview page (just renamed from "Metricas") still reads like a generic
admin panel: a flat row of small white `MetricCard`s, then a vertical-bar
star-distribution chart with no numbers on it — the user doesn't understand
what it's showing (count? percent?) at a glance. The ask is a bolder,
"editorial" visual treatment that still serves the page's real job
(visualizing metrics clearly), without touching the design system or
extending this treatment to Reviews/Config (those stay as-is — they're
work screens, not a glance/cover page).

The brand system (`docs/atrium-brand-colors.html`) already defines exactly
the kind of surface this calls for: a dark `ink` panel with a radial `lime`
glow, big sans-serif numerals, and a serif-italic word for emphasis — the
"head" hero pattern the brand sheet itself is built around, currently
unused anywhere in this app. This redesign borrows that surface for
Overview's top section instead of inventing a new visual style.

## 1. Hero panel (replaces the "Actividad"/"Calidad" light-card clusters)

Single `bg-ink`, `rounded-[26px]` panel with a subtle lime radial glow
(matching the brand sheet's `.head::after` treatment), replacing both
metric-cluster grids entirely — every metric currently split across
"Actividad" and "Calidad" moves inside this one panel.

- **Headline stat**: rating promedio, large sans numeral (`4.6`), with a
  serif-italic lime word next to it describing the tier:
  - `>= 4.5` → "Excelente"
  - `>= 4.0` → "Muy bien"
  - `>= 3.0` → "Regular"
  - `< 3.0` → "A mejorar"
  - `total === 0` → "Sin datos aun" (no reviews yet — don't imply a
    judgment when there's no data)
- **Secondary stats row**: Total reviews, % Buenas, % Compartidas a
  Google, Escaneos QR, Conversion — rendered as label/value pairs inside
  the same dark panel, separated by hairline dividers at 20% cream opacity
  (the brand sheet's `--line-inverse` token, not yet in this app's Tailwind
  theme — added by this change). Text uses lime (labels) and cream
  (values) on the ink ground, both AAA-contrast pairings per the brand
  sheet's own measurements.

This is a purely presentational surface — no new queries, all values
already computed by the existing `summarizeReviews`/`calculateConversionRate`
calls on this page.

## 2. Star distribution: horizontal bars with explicit counts

Replaces the 5 equal-width vertical bars (whose height alone conveyed
"share of total," with no number visible) with 5 horizontal rows, ordered
5★ to 1★ top-to-bottom, each showing: the star label, a filled track sized
to that star's share of total, and the exact count + percent written out
next to it (`12 (24%)`) — removing all ambiguity about what the visual is
showing. Same amber/green-fill color split as before (1-3★ amber, 4-5★
green — matches the existing "good" classification threshold of `rating >=
4` in `lib/classify.ts`, so the chart's color split isn't arbitrary, it
mirrors how the system itself already judges a review).

Stays in a normal light card below the hero (not part of the dark panel) —
this section is a supporting detail, not the headline.

## 3. New rating-tier helper (testable, in `lib/metrics.ts`)

```ts
export function describeAverageRating(averageRating: number, total: number): string {
  if (total === 0) return "Sin datos aun";
  if (averageRating >= 4.5) return "Excelente";
  if (averageRating >= 4) return "Muy bien";
  if (averageRating >= 3) return "Regular";
  return "A mejorar";
}
```

Added alongside the existing `calculateConversionRate` (same file, same
"small pure display-logic helper, unit tested" pattern already established
there).

## Out of scope

- No change to Reviews, Config, Login, or the public review pages —
  editorial treatment is Overview-only, per explicit scope decision.
- No change to the "Ultimas 24 horas" activity table.
- No system-wide `<em>` auto-styling rule (the brand sheet describes one
  for `h1-h4 em`, but this app has never had it and adding it now is out
  of scope — the hero's serif-italic word gets its classes applied
  directly, same manual-utility-classes convention already used
  everywhere else in this codebase).
- `--color-line-inverse` is the only new design token this change needs;
  no other unused brand-sheet tokens (`--color-dark`, `--color-track`,
  etc.) are being added — YAGNI, add them only when a surface actually
  needs one, as decided in the prior sidebar redesign pass.

## Testing

- Unit tests for `describeAverageRating` (4 rating-tier branches + the
  `total === 0` branch) in `tests/metrics.test.ts`, following the existing
  `calculateConversionRate` test pattern in the same file.
- No new tests for the star-distribution percent math — it's the same
  inline `count/total` calculation style already used for the (removed)
  vertical bars' height, not extracted into a tested helper (matches
  existing convention: only genuinely reusable/non-trivial logic gets a
  `lib/` helper + test, not every inline display calculation).
- Manual verification: `bun run dev`, confirm the hero renders with the
  correct tier word at a few different rating values (may require
  temporarily viewing a client with different review data, or trusting
  the unit tests for the branching and just eyeballing the current data's
  rendering), and confirm the star-distribution rows show plausible
  counts/percents that sum sensibly.
