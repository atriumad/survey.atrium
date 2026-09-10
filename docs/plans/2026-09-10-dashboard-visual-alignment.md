# Dashboard Visual Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a sidebar to the dashboard, introduce a shared `PageHeader`, and rebuild the Config page with real `Card`/`Label` components and empty states — fixing the brand's "no whole heading in serif" violation everywhere it appears.

**Architecture:** Purely presentational refactor on top of existing shadcn/ui primitives (`Card`, `Label`, `Button`) already in the codebase — no new dependencies. A new `Sidebar` client component replaces the horizontal nav in `app/dashboard/(protected)/layout.tsx`; a new `PageHeader` component standardizes page titles across Metricas/Reviews/Config; Config's two sections move from hand-rolled divs to `Card` subcomponents with real `Label`s and empty states.

**Tech Stack:** Next.js 16 (App Router, Server + Client Components), Tailwind v4 (`@theme` tokens already in `app/globals.css`), shadcn/ui-style primitives in `components/ui/`.

**Global constraint:** No `font-serif italic` may remain as a full heading anywhere touched by this plan. The serif italic face is reserved for an `<em>` emphasis word inside a heading — never the whole heading — per `docs/atrium-brand-colors.html`'s "Rules of use" section.

---

### Task 1: Sidebar navigation

**Files:**
- Create: `app/dashboard/(protected)/sidebar.tsx`
- Modify: `app/dashboard/(protected)/layout.tsx`

**Step 1: Create the sidebar**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { logout } from "./actions";
import type { Role } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Metricas" },
  { href: "/dashboard/reviews", label: "Reviews" },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items =
    role === "admin" ? [...NAV_ITEMS, { href: "/dashboard/config", label: "Config" }] : NAV_ITEMS;

  return (
    <aside className="flex flex-row lg:flex-col w-full lg:w-56 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-cool bg-off-white lg:min-h-screen">
      <div className="hidden lg:block p-4">
        <p className="text-sm font-semibold text-ink">Atrium</p>
        <p className="text-xs text-body capitalize">{role}</p>
      </div>
      <nav className="flex-1 flex flex-row lg:flex-col gap-1 p-3 overflow-x-auto">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-[14px] px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                active ? "bg-white shadow-card text-ink" : "text-body hover:bg-white/60 hover:text-ink"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 lg:mt-auto">
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            Cerrar sesion
          </Button>
        </form>
      </div>
    </aside>
  );
}
```

**Step 2: Wire it into the layout**

Read the current file first (`app/dashboard/(protected)/layout.tsx`) — it has an unauthenticated-redirect block and a no-profile dead-end block that must stay exactly as they are. Only the final authenticated return value changes: replace the `<header>`-based nav with the sidebar.

Replace:
```tsx
  return (
    <div className="min-h-screen flex flex-col bg-off-white">
      <header className="border-b border-cool bg-white/80 backdrop-blur px-6 py-3 flex justify-between items-center sticky top-0">
        <nav className="flex gap-1">
          <Link
            href="/dashboard"
            className="rounded-full px-4 py-2 text-sm font-medium text-body hover:bg-muted hover:text-ink transition-colors"
          >
            Metricas
          </Link>
          <Link
            href="/dashboard/reviews"
            className="rounded-full px-4 py-2 text-sm font-medium text-body hover:bg-muted hover:text-ink transition-colors"
          >
            Reviews
          </Link>
          {profile.role === "admin" && (
            <Link
              href="/dashboard/config"
              className="rounded-full px-4 py-2 text-sm font-medium text-body hover:bg-muted hover:text-ink transition-colors"
            >
              Config
            </Link>
          )}
        </nav>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">Cerrar sesion</Button>
        </form>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
```
with:
```tsx
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-off-white">
      <Sidebar role={profile.role} />
      <main className="flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
```

Add `import { Sidebar } from "./sidebar";` near the top. The `Link` import becomes unused in this file after the change — remove it. The `logout` import is still used (by the no-profile dead-end block above), keep it. The `Button` import is also still used there, keep it.

**Step 3: Typecheck and build**

Run: `bunx tsc --noEmit && bun run build`
Expected: no errors. Build output should still list `/dashboard`, `/dashboard/config`, `/dashboard/reviews` as dynamic routes (unchanged route list).

**Step 4: Manual check**

Run: `bun run dev`, log in as an admin, confirm: sidebar shows Metricas/Reviews/Config, the current page is highlighted, "Cerrar sesion" logs out. Then log in as a manager (a profile with `role = 'manager'`) and confirm Config is hidden from the sidebar.

**Step 5: Commit**

```bash
git add "app/dashboard/(protected)/sidebar.tsx" "app/dashboard/(protected)/layout.tsx"
git commit -m "feat: add dashboard sidebar navigation"
```

---

### Task 2: Shared PageHeader

**Files:**
- Create: `app/dashboard/(protected)/page-header.tsx`

**Step 1: Create the component**

```tsx
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-medium text-ink tracking-tight">{title}</h1>
        {description && <p className="text-sm text-body mt-1">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
```

No margin on the outer div — every page that uses this already wraps its content in a `flex flex-col gap-*` container, so spacing comes from the parent's `gap`, not from `PageHeader` itself.

**Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors (this file isn't imported anywhere yet, so this just confirms it compiles standalone).

**Step 3: Commit**

```bash
git add "app/dashboard/(protected)/page-header.tsx"
git commit -m "feat: add shared dashboard PageHeader component"
```

---

### Task 3: Metricas uses PageHeader

**Files:**
- Modify: `app/dashboard/(protected)/page.tsx`

**Step 1: Swap the header**

Read the current file first. Add `import { PageHeader } from "./page-header";` near the top (alongside the existing imports).

Replace:
```tsx
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-serif italic text-ink">Metricas</h1>
        {profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      </div>
```
with:
```tsx
      <PageHeader
        title="Metricas"
        actions={profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      />
```

Everything else in the file (the metric cards grid, the star distribution block, `MetricCard`) stays exactly as it is.

**Step 2: Typecheck and build**

Run: `bunx tsc --noEmit && bun run build`
Expected: no errors.

**Step 3: Commit**

```bash
git add "app/dashboard/(protected)/page.tsx"
git commit -m "feat: use PageHeader on the Metricas page"
```

---

### Task 4: Reviews uses PageHeader (+ move Export button into it)

**Files:**
- Modify: `app/dashboard/(protected)/reviews/reviews-table.tsx`
- Modify: `app/dashboard/(protected)/reviews/page.tsx`

**Step 1: Split `reviews-table.tsx` into `ExportButton` + `ReviewsTable`**

Read the current file first. Replace its entire contents with:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reviewsToCsv } from "@/lib/csv";
import type { Review } from "@/lib/types";

export function ExportButton({ reviews }: { reviews: Review[] }) {
  function handleExport() {
    const csv = reviewsToCsv(reviews);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reviews-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={reviews.length === 0}>
      Exportar CSV
    </Button>
  );
}

export function ReviewsTable({ reviews }: { reviews: Review[] }) {
  return (
    <div className="rounded-[26px] bg-white overflow-hidden shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cool text-left text-xs uppercase tracking-wide text-body">
            <th className="p-3 font-medium">Fecha</th>
            <th className="p-3 font-medium">Rating</th>
            <th className="p-3 font-medium">Clasificacion</th>
            <th className="p-3 font-medium">Comentario</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.id} className="border-b border-cool last:border-0">
              <td className="p-3 text-body">{review.created_at.slice(0, 10)}</td>
              <td className="p-3 font-medium text-ink">{review.rating}★</td>
              <td className="p-3">
                <Badge variant={review.classification === "good" ? "mint" : "destructive"}>
                  {review.classification}
                </Badge>
              </td>
              <td className="p-3 text-body">{review.comment ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {reviews.length === 0 && (
        <p className="text-body text-center py-8">Sin reviews todavia.</p>
      )}
    </div>
  );
}
```

(Note the empty-state text now uses `text-body` instead of the previous `text-muted-foreground` — this was an inconsistency with the rest of the app, fixed here as part of the same edit.)

**Step 2: Update the page to use both**

Read the current file first. Replace its entire contents with:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { ExportButton, ReviewsTable } from "./reviews-table";
import { LocationFilter } from "../location-filter";
import { PageHeader } from "../page-header";
import type { Review } from "@/lib/types";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; classification?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("client_id", profile.clientId);

  let query = supabase
    .from("reviews")
    .select("*")
    .eq("client_id", profile.clientId)
    .order("created_at", { ascending: false });

  const effectiveLocation = profile.role === "manager" ? profile.locationId : params.location;
  if (effectiveLocation) query = query.eq("location_id", effectiveLocation);
  if (params.classification) query = query.eq("classification", params.classification);
  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", params.to);

  const { data: reviews } = await query;
  const reviewsList = (reviews ?? []) as Review[];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reviews"
        actions={
          <div className="flex items-center gap-2">
            {profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
            <ExportButton reviews={reviewsList} />
          </div>
        }
      />
      <ReviewsTable reviews={reviewsList} />
    </div>
  );
}
```

**Step 3: Typecheck and build**

Run: `bunx tsc --noEmit && bun run build`
Expected: no errors.

**Step 4: Manual check**

Run: `bun run dev`, open `/dashboard/reviews`, confirm the "Exportar CSV" button is now next to the title (not above the table), and still downloads a CSV. Confirm it's disabled when there are zero reviews for the current filter.

**Step 5: Commit**

```bash
git add "app/dashboard/(protected)/reviews/reviews-table.tsx" "app/dashboard/(protected)/reviews/page.tsx"
git commit -m "feat: use PageHeader on Reviews, move export button into it"
```

---

### Task 5: Config rebuild

**Files:**
- Modify: `app/dashboard/(protected)/config/page.tsx`
- Modify: `app/dashboard/(protected)/config/locations-section.tsx`
- Modify: `app/dashboard/(protected)/config/keywords-section.tsx`

**Step 1: Update the page**

Read the current file first. Replace its entire contents with:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { LocationsSection } from "./locations-section";
import { KeywordsSection } from "./keywords-section";
import { PageHeader } from "../page-header";

export default async function ConfigPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: locations }, { data: keywords }] = await Promise.all([
    supabase.from("locations").select("*").eq("client_id", profile.clientId),
    supabase.from("negative_keywords").select("*").eq("client_id", profile.clientId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Configuracion"
        description="Locales, codigos QR y palabras clave para clasificar reviews."
      />
      <LocationsSection locations={locations ?? []} />
      <KeywordsSection keywords={keywords ?? []} />
    </div>
  );
}
```

**Step 2: Rebuild `locations-section.tsx`**

Read the current file first. Replace its entire contents with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildReviewUrl, generateQrDataUrl } from "@/lib/qr";
import { createLocation, deleteLocation } from "./actions";
import type { Location } from "@/lib/types";

export function LocationsSection({ locations }: { locations: Location[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Locales</h2>
      <Card>
        <CardHeader>
          <CardTitle>Agregar local</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createLocation} className="flex gap-3 flex-wrap items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-name">Nombre</Label>
              <Input id="location-name" name="name" placeholder="Sucursal Centro" required className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-slug">Slug</Label>
              <Input id="location-slug" name="slug" placeholder="centro" required className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-place-id">Google Place ID (opcional)</Label>
              <Input id="location-place-id" name="googlePlaceId" className="w-56" />
            </div>
            <Button type="submit">Agregar</Button>
          </form>
        </CardContent>
      </Card>

      {locations.length === 0 ? (
        <p className="text-sm text-body">Todavia no agregaste ningun local.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {locations.map((loc) => (
            <LocationRow key={loc.id} location={loc} />
          ))}
        </div>
      )}
    </div>
  );
}

function LocationRow({ location }: { location: Location }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const url = buildReviewUrl(baseUrl, location.slug);
    generateQrDataUrl(url).then(setQrDataUrl);
  }, [location.slug]);

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-4">
        {qrDataUrl && <img src={qrDataUrl} alt={`QR ${location.name}`} className="w-16 h-16" />}
        <div className="flex-1">
          <p className="font-medium text-ink">{location.name}</p>
          <p className="text-sm text-body">/r/{location.slug}</p>
        </div>
        {qrDataUrl && (
          <a href={qrDataUrl} download={`qr-${location.slug}.png`}>
            <Button variant="outline" size="sm">Descargar QR</Button>
          </a>
        )}
        <Button variant="ghost" size="sm" onClick={() => deleteLocation(location.id)}>
          Eliminar
        </Button>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Rebuild `keywords-section.tsx`**

Read the current file first. Replace its entire contents with:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createKeyword, deleteKeyword } from "./actions";

interface Keyword {
  id: string;
  keyword: string;
}

export function KeywordsSection({ keywords }: { keywords: Keyword[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Palabras clave negativas</h2>
      <Card>
        <CardHeader>
          <CardTitle>Agregar palabra clave</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createKeyword} className="flex gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="keyword">Palabra</Label>
              <Input id="keyword" name="keyword" placeholder="ej: lento, sucio, frio" required className="w-64" />
            </div>
            <Button type="submit">Agregar</Button>
          </form>
        </CardContent>
      </Card>

      {keywords.length === 0 ? (
        <p className="text-sm text-body">Todavia no agregaste palabras clave.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <span
              key={kw.id}
              className="flex items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1 text-sm text-ink font-medium"
            >
              {kw.keyword}
              <button
                onClick={() => deleteKeyword(kw.id)}
                className="text-ink/50 hover:text-destructive transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Typecheck and build**

Run: `bunx tsc --noEmit && bun run build`
Expected: no errors.

**Step 5: Manual check**

Run: `bun run dev`, open `/dashboard/config` as admin. Confirm: page title + description render, "Locales" and "Palabras clave negativas" show as small uppercase eyebrows (not big headings), both add-forms are inside a white card with a title and labeled inputs, each existing location renders as its own card, and — if you temporarily test against a client with zero locations or zero keywords — the empty-state text shows instead of a blank area.

**Step 6: Commit**

```bash
git add "app/dashboard/(protected)/config/page.tsx" "app/dashboard/(protected)/config/locations-section.tsx" "app/dashboard/(protected)/config/keywords-section.tsx"
git commit -m "feat: rebuild Config page with Card components, labels, and empty states"
```

---

### Task 6: Fix remaining serif-italic headings (Login, Gracias)

**Files:**
- Modify: `app/dashboard/login/page.tsx`
- Modify: `app/r/[locationSlug]/gracias/page.tsx`

Both are standalone screens outside the dashboard chrome (auth screen, public thank-you page) — they get a direct className fix only, no `PageHeader` import.

**Step 1: Fix Login's heading**

In `app/dashboard/login/page.tsx`, replace:
```tsx
            <h1 className="text-3xl font-serif italic text-ink text-center">Iniciar sesion</h1>
```
with:
```tsx
            <h1 className="text-2xl font-medium text-ink text-center">Iniciar sesion</h1>
```

**Step 2: Fix Gracias's heading**

In `app/r/[locationSlug]/gracias/page.tsx`, replace:
```tsx
      <h1 className="text-3xl font-serif italic text-ink text-center">Gracias por tu opinion!</h1>
```
with:
```tsx
      <h1 className="text-2xl font-medium text-ink text-center">Gracias por tu opinion!</h1>
```

**Step 3: Confirm no violations remain**

Run: `grep -rn "font-serif italic" app/`
Expected: no output (empty result) — every full-heading serif-italic usage in the entire `app/` directory has been removed by this plan.

**Step 4: Typecheck and build**

Run: `bunx tsc --noEmit && bun run build`
Expected: no errors.

**Step 5: Commit**

```bash
git add "app/dashboard/login/page.tsx" "app/r/[locationSlug]/gracias/page.tsx"
git commit -m "fix: remove remaining full-heading serif-italic on Login and Gracias"
```
