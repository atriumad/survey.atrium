# Precision redesign: light canvas, borders over shadows

## Context

Prior sessions pushed the dashboard toward a "bold editorial" look — a
dark `ink` hero panel with a lime radial glow on Overview, and a matching
dark split-panel on Login. The client's feedback: the brand personality is
actually **"confiable, directo, sin vueltas"** (trustworthy, direct,
no-nonsense), and the concrete reference given is **midday.ai**'s
dashboard — light canvas, typographic precision, thin hairline borders
instead of shadowed cards, real (never decorative) small charts, and
exactly one elegant serif accent per view rather than a whole dramatic
surface. Full Design Context is now recorded in `.impeccable.md` and
`.github/copilot-instructions.md`.

This is a genuine direction change, not an addition: the dark panels on
Overview and Login are removed, not kept alongside the new style. Scope
covers the whole product — dashboard (Overview, Reviews, Settings), Login,
and the public review form — for full brand consistency, per the client's
explicit choice.

## 1. Foundation: borders replace shadows

- `components/ui/card.tsx`: `Card`'s `shadow-card` class is replaced with
  `border border-cool` (an existing token already used everywhere else
  for hairlines — no new CSS variable). This ripples automatically to
  every `Card` usage: Settings' location/keyword cards, `MetricCard`.
- Any standalone container currently hand-rolling
  `rounded-[26px] bg-white ... shadow-card` (not going through the `Card`
  component) gets the same swap: `shadow-card` → `border border-cool`.
  Affected: `reviews-table.tsx`'s table wrapper, the star-distribution
  card on Overview, `review-form.tsx`'s form container.
- The sidebar's active-nav-item pill (`bg-white shadow-card text-ink`)
  becomes `bg-white border border-cool text-ink` for the same reason —
  elevation now reads through a border, not a shadow, everywhere.
- `--shadow-card` itself stays defined in `app/globals.css` (still a
  valid token, just no longer the default treatment) in case a future
  surface genuinely wants elevation — but no default component reaches
  for it after this change.
- `--color-line-inverse` (added for the now-removed dark hero divider) is
  deleted — it has no other consumer after this redesign, and keeping an
  unused dark-mode-only token around is exactly the kind of premature
  addition the brand system has avoided elsewhere (YAGNI, matches the
  precedent set in the earlier sidebar-redesign review pass).

## 2. Overview hero → flat metric-tile grid

Removes: the `bg-ink` panel, the radial lime glow, and the
"Actividad"/"Calidad" clustering concept entirely (that grouping was a
workaround for the panel's internal hierarchy, not needed once every tile
is its own bordered surface).

Replaces with: a single, even grid of 6 bordered tiles (matching
`MetricCard`'s existing visual weight — no tile is a different size than
another, mirroring how midday's own metric row mixes content type but not
tile size):

- **Average rating** — the one tile with extra content: the number in the
  existing large scale, `StarRating` next to it, and the tier word
  (`describeAverageRating`) rendered as the view's one serif-italic accent
  (`font-serif italic`) in **ink**, not lime-on-dark. The 30-day trend
  indicator moves here too, recolored for a light surface (see below).
- **Total reviews**, **% Good**, **% Shared to Google**, **QR Scans**,
  **Conversion** — plain `MetricCard`s, unchanged from their pre-hero
  form.

Trend indicator recoloring (was `text-lime`/`text-amber`/`text-cream/60`
on `bg-ink`; needs light-surface equivalents):
- up → `text-green` (existing brand token, not the lime that's now reserved
  for rare true accents)
- down → `text-amber-fill` (a warm, non-alarming warning tone — matches
  the design doc precedent from the original trend feature of "not the
  destructive red, this is a trend not an error")
- flat → `text-body`

Star distribution keeps its current horizontal-bar layout and content —
only its container's `shadow-card` becomes `border border-cool`.

## 3. Login → light, bordered card (no dark panel)

Removes: the `hidden lg:flex ... bg-ink` left half entirely, along with
its radial glow.

Replaces with: a single centered card (not a 50/50 split — there's no
second surface to fill once the dark half is gone), `border border-cool`
instead of `shadow-card`, on the existing `bg-cream` page background. The
tagline that lived in the dark panel — "Reviews, no *hassle*." — moves
into the card itself, above the "Sign in" heading, with "hassle" as the
one serif-italic accent word, now in **ink** rather than lime-on-dark.
This keeps the brand voice (the tagline) without the dramatic surface.

## 4. Reviews table + public review form

No structural change — both already have the right shape (a bordered
white surface with content inside). Just the `shadow-card` → `border
border-cool` token swap from §1.

## Out of scope

- Settings page UI/logic improvements and user-profile editing — still
  tracked separately, unaffected by this visual-language change beyond
  automatically inheriting the `Card` border treatment.
- Any change to business logic, queries, or data shown — this is purely
  visual/structural.
- Dark mode — out of scope; light is the deliberate, sole theme per the
  Design Context (this audience checks the dashboard in normal daytime
  business contexts).

## Testing

No business logic changes. Verification is `bunx tsc --noEmit`,
`bun test` (all existing tests should still pass unchanged — none assert
on CSS classes), `bun run build`, and a manual pass through Login,
Overview, Reviews, Settings, and the public review form confirming: no
`bg-ink`/dark panel remains anywhere, every previously-shadowed surface
now shows a visible hairline border instead, and the Overview hero's tier
word and Login's tagline both still show the serif-italic accent, just
recolored for a light background.
