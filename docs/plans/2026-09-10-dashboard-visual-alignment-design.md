# Dashboard visual alignment + sidebar

## Context

The dashboard (Metricas, Reviews, Config) and two standalone screens (Login,
the public "Gracias" thank-you page) violate the Atrium brand system
(`docs/atrium-brand-colors.html`) in one systematic way: **4 places** use
`text-3xl font-serif italic` as a full page-title style —
`app/dashboard/(protected)/page.tsx`, `.../config/page.tsx`,
`app/dashboard/login/page.tsx`, `app/r/[locationSlug]/gracias/page.tsx`. The
brand's own rules explicitly forbid this: "no whole heading in the serif" —
the serif italic is reserved for an `<em>` emphasis word inside a heading,
never the heading itself.

Beyond that, Config specifically doesn't feel like part of the product: its
two forms are hand-rolled divs with the shadow/radius styles duplicated
inline (already partially fixed by extracting `--shadow-card` in an earlier
review pass) rather than the real `<Card>` component, its inputs have no
`<Label>` (unlike Login and the public review form, which do), and there's
no empty state when a client has zero locations or keywords yet — it reads
as an internal debug form rather than a serious admin screen.

There's also no sidebar: navigation is a plain horizontal link row in the
header, which doesn't scale visually and doesn't read as a "dashboard."

## 1. Sidebar

New file: `app/dashboard/(protected)/sidebar.tsx` ("use client", uses
`usePathname()` for active-link state).

- Fixed-width column (`w-56`), full height, `bg-off-white` (same as the page
  background — light/integrated, not a dark branded panel), separated by
  `border-r border-cool`.
- Top: small "Atrium" label + the user's role (`profile.role`), muted text.
- Nav items: Metricas (`/dashboard`), Reviews (`/dashboard/reviews`), Config
  (`/dashboard/config`, admin-only) — active state: `bg-white shadow-card
  text-ink font-medium`; inactive: `text-body hover:bg-white/60`.
- Bottom: the logout button (moves here from the current header).
- `app/dashboard/(protected)/layout.tsx` changes from a header+nav bar to
  `<div className="flex min-h-screen bg-off-white"><Sidebar profile={profile} /><main className="flex-1 p-6 lg:p-8">{children}</main></div>`.
- Mobile (`<lg`): sidebar collapses to a horizontal scrollable row above the
  content instead of a column — no hamburger/drawer for a 3-item nav (YAGNI;
  revisit only if a real mobile usage need shows up).

## 2. Shared `PageHeader`

New file: `app/dashboard/(protected)/page-header.tsx`:

```tsx
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-medium text-ink tracking-tight">{title}</h1>
        {description && <p className="text-sm text-body mt-1">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
```

Used by Metricas (`actions` = `LocationFilter`), Reviews (`actions` = the
"Exportar CSV" button, moved here from the table component), and Config
(`description` set, no actions). Login and Gracias are standalone screens
outside the dashboard chrome — they get a direct className fix only (no
`PageHeader` import), see §4.

## 3. Config rebuild

- Page: `<PageHeader title="Configuracion" description="Locales, codigos QR y palabras clave para clasificar reviews." />`.
- Section labels drop from `text-xl font-medium` (page-title weight,
  competing with `PageHeader`) to an eyebrow style:
  `text-xs uppercase tracking-wide font-semibold text-body`.
- "Agregar local" / "Agregar palabra clave" forms move into
  `<Card><CardHeader><CardTitle>...</CardTitle></CardHeader><CardContent>`,
  and every `<Input>` gets a real `<Label htmlFor>` above it (currently
  placeholder-only).
- Each existing location renders as its own `<Card size="sm">` (replacing
  the hand-rolled `rounded-[18px] bg-white p-4 shadow-card` div).
- Empty states: "Todavia no agregaste ningun local." /
  "Todavia no agregaste palabras clave." when the respective list is empty.

## 4. Remaining touch-ups

- `app/dashboard/(protected)/page.tsx` (Metricas): heading becomes
  `<PageHeader title="Metricas" actions={profile.role === "admin" && <LocationFilter .../>} />`.
- `app/dashboard/(protected)/reviews/page.tsx`: same pattern, `actions` slot
  gets the "Exportar CSV" button (currently rendered inside
  `reviews-table.tsx`'s own top row — button moves up to the page header,
  `ReviewsTable` keeps just the table + empty state).
- `app/dashboard/login/page.tsx`: `<h1 className="text-3xl font-serif italic text-ink text-center">` becomes `<h1 className="text-2xl font-medium text-ink text-center">`. No `PageHeader` (standalone auth screen).
- `app/r/[locationSlug]/gracias/page.tsx`: same class fix, same reasoning (public standalone screen).
- `app/dashboard/(protected)/reviews/reviews-table.tsx`: empty-state text
  uses `text-muted-foreground`, inconsistent with `text-body` used
  everywhere else — align it.

## Out of scope (deferred, not part of this pass)

- Adding the brand sheet's unused tokens (`--color-dark`, `--color-track`,
  `--color-pending`, `--color-green-ink`, `--color-amber-ink`,
  `--color-red-tint`, `--color-muted-soft`, `--color-line`/`--color-line-inverse`,
  stage colors) — none of the changes in this pass need them; the sidebar
  came out light per explicit choice, so no dark-panel surface is being
  introduced. Add them if/when a surface actually needs one.
- A real mobile drawer/hamburger for the sidebar.
- Any change to `review-form.tsx` (already covered by the earlier code
  review's fix wave) or the rest of the in-progress redesign/email-field
  work already in the working tree — this pass only touches the files
  listed above.

## Testing

No new business logic — this is a presentational refactor. Verification is
`bunx tsc --noEmit`, `bun run build` (confirms no broken imports/JSX), and a
manual pass through all 6 touched screens (Metricas, Reviews, Config, Login,
Gracias, plus the sidebar on both an admin and a manager login) checking:
active nav state highlights correctly, Config's empty states render with
zero locations/keywords, and no `font-serif italic` full-heading remains
anywhere in the diff (`grep -rn "font-serif italic" app/`).
