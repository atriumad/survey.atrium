# Login page editorial redesign

## Context

`app/dashboard/login/page.tsx` is a plain white `Card` centered on flat
`bg-cream` — functional but generic, with none of the editorial treatment
just applied to the Overview page's hero (dark `ink` panel, lime radial
glow, serif-italic emphasis word). The ask is to bring that same visual
language to Login so the brand feels consistent from the first screen a
user sees.

## Design

**Split-screen layout** (`lg:` and up): left half is a full-height `ink`
panel with the lime radial glow (same visual technique as the Overview
hero — reused as a pattern, not extracted into a shared component since
each usage has different sizing/positioning needs and there are only two
instances), containing "Atrium" as a small brand mark and a tagline in the
same "phrase + serif-italic accent word" motif already established by the
Overview hero's rating-tier treatment:

> Reviews, sin *vueltas*.

("vueltas" in `font-serif italic text-lime`, rest in `text-cream`.)

Right half is the existing form — email, password, submit — on a plain
light background (`bg-off-white`, matching the rest of the dashboard's
canvas color, not the card-on-cream treatment it had before), no longer
wrapped in a white `Card` since it's no longer floating on a colored
background that needs a light surface underneath it to read as content.

**Mobile** (below `lg:`): the ink panel is hidden entirely (`hidden
lg:flex`), the form fills the full width on a plain `bg-off-white`
background — same responsive strategy already used for the sidebar
(content-first on small screens, brand real estate only when there's room
for it).

**Error state**: unchanged behavior (the existing red-soft banner above
the form when `?error=1` is present), just now sitting in the form half
rather than inside a white card.

## Out of scope

- No shared "hero panel" component extracted for the glow effect — two
  usages (Overview, Login) with different sizing don't justify an
  abstraction yet (YAGNI); revisit if a third surface wants the same
  treatment.
- No change to the login server action (`app/dashboard/login/actions.ts`)
  or any auth logic — this is a pure visual/layout change to the page
  component.
- No change to any other standalone screen (Gracias, the public review
  page) — those keep their current plain treatment; this pass is Login
  only, per the user's explicit ask.

## Testing

No business logic changes — verification is `bunx tsc --noEmit`,
`bun run build`, and a manual check at both a wide viewport (split-screen
visible, tagline renders with the italic accent word) and a narrow one
(ink panel hidden, form fills the screen, still fully usable).
