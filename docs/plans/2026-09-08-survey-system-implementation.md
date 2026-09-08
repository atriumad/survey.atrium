# Survey System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a QR-driven review/survey system (Next.js + Supabase) — customer scans QR at table, rates 1-5 stars, gets classified good/bad, sees a thank-you page (with a "share on Google" flow if good), and staff see a metrics dashboard.

**Architecture:** Single Next.js 16 App Router project. Public routes (`/r/[locationSlug]`) write reviews via a server action into Supabase Postgres, protected by RLS so `anon` can only INSERT reviews / SELECT locations. Protected routes (`/dashboard/*`) use Supabase Auth + `@supabase/ssr` middleware, reading through RLS scoped by `profiles.client_id`/`role`. All tables carry `client_id` for future multi-tenant, though only one client exists today.

**Tech Stack:** Next.js 16, TypeScript, Tailwind, shadcn/ui (style `base-nova`, matching sibling repos), Supabase (Postgres + Auth + RLS), Zod, Vitest, `qrcode` (QR generation), Recharts (dashboard charts), npm.

**Reference design doc:** `docs/plans/2026-09-08-survey-system-design.md`

---

## Task 0: Project scaffold

**Files:**
- Create: whole project root (Next.js init)

**Step 1: Scaffold Next.js app**

```bash
cd /Users/ventura/Desktop/atrium/survey.dcop.atrium
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-npm
```
When prompted, accept App Router, no `src/` dir (matches sibling repos).

**Step 2: Verify dev server boots**

Run: `npm run dev` then `curl -s http://localhost:3000 | head -5`
Expected: HTML output, no errors. Stop dev server after checking (Ctrl+C).

**Step 3: Init shadcn/ui matching sibling convention**

```bash
npx shadcn@latest init
```
Answer to match `atrium.bingo/components.json`: style `base-nova` (or closest available — pick `neutral` base color if prompted), CSS vars yes, RSC yes, lucide icons.

Then add the components we know we'll need:
```bash
npx shadcn@latest add button card input textarea label badge table select dialog form toast
```

**Step 4: Install remaining deps**

```bash
npm install @supabase/supabase-js @supabase/ssr zod qrcode recharts
npm install -D vitest @types/qrcode
```

**Step 5: Add test script to package.json**

Edit `package.json` scripts to add (matching atrium.bingo):
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 6: Create vitest config**

Create `vitest.config.mts`:
```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with shadcn, Supabase, and test tooling"
```

---

## Task 1: Environment config and Supabase clients

**Files:**
- Create: `.env.local.example`
- Create: `.env.local` (gitignored — do NOT commit)
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts`

**Step 1: Create env example**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Create `.env.local` with real values once you've created the Supabase project (see Task 2) — this file must already be in `.gitignore` (Next.js scaffold adds `.env*.local` by default; verify with `grep env .gitignore`).

**Step 2: Browser Supabase client**

Create `lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Step 3: Server Supabase client**

Create `lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component without a response to write to — ignore
          }
        },
      },
    }
  );
}
```

**Step 4: Middleware Supabase client + session refresh**

Create `lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/dashboard") && request.nextUrl.pathname !== "/dashboard/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/login";
    return NextResponse.redirect(url);
  }

  return response;
}
```

**Step 5: Root middleware**

Create `middleware.ts`:
```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client helpers and auth middleware"
```

---

## Task 2: Supabase project + database schema

**Files:**
- Create: `supabase/migrations/0001_survey_schema.sql`

**Step 1: Create Supabase project**

If not already done: create a Supabase project via https://supabase.com/dashboard (or `supabase projects create` if using the CLI and already logged in). Copy the project URL and anon key into `.env.local`, and the service role key too (used later only in trusted server contexts, never shipped to the browser).

**Step 2: Write the schema migration**

Create `supabase/migrations/0001_survey_schema.sql`:
```sql
create extension if not exists pgcrypto;

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  primary_color text,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  slug text not null,
  google_place_id text,
  created_at timestamptz not null default now(),
  unique (client_id, slug)
);

create index locations_client_id_idx on locations (client_id);

create table negative_keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  keyword text not null,
  created_at timestamptz not null default now()
);

create index negative_keywords_client_id_idx on negative_keywords (client_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  classification text not null check (classification in ('good', 'bad')),
  matched_keywords text[],
  shared_to_google boolean not null default false,
  created_at timestamptz not null default now()
);

create index reviews_client_id_idx on reviews (client_id);
create index reviews_location_id_idx on reviews (location_id);
create index reviews_created_at_idx on reviews (created_at desc);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  role text not null check (role in ('admin', 'manager')),
  location_id uuid references locations (id) on delete set null,
  created_at timestamptz not null default now()
);

create index profiles_client_id_idx on profiles (client_id);

-- Helper: current user's profile, used by RLS policies below.
create or replace function auth_profile()
returns table (client_id uuid, role text, location_id uuid)
language sql
security definer
stable
as $$
  select client_id, role, location_id from profiles where id = auth.uid();
$$;

alter table clients enable row level security;
alter table locations enable row level security;
alter table negative_keywords enable row level security;
alter table reviews enable row level security;
alter table profiles enable row level security;

-- Public (anon) needs to read client/location info to render the survey page.
create policy "anon can read clients" on clients for select to anon using (true);
create policy "anon can read locations" on locations for select to anon using (true);

-- Public (anon) can only insert reviews, never read/update/delete them.
create policy "anon can insert reviews" on reviews for insert to anon with check (true);

-- Authenticated users see only their own client's data.
create policy "authenticated read own client" on clients for select to authenticated
  using (id = (select client_id from auth_profile()));

create policy "authenticated read own client locations" on locations for select to authenticated
  using (client_id = (select client_id from auth_profile()));

create policy "admin manages locations" on locations for all to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (select role from auth_profile()) = 'admin'
  );

create policy "authenticated read own client keywords" on negative_keywords for select to authenticated
  using (client_id = (select client_id from auth_profile()));

create policy "admin manages keywords" on negative_keywords for all to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (select role from auth_profile()) = 'admin'
  );

-- Reviews: admin sees all reviews for their client; manager sees only their location's.
create policy "authenticated read own client reviews" on reviews for select to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (
      (select role from auth_profile()) = 'admin'
      or location_id = (select location_id from auth_profile())
    )
  );

create policy "authenticated read own profile" on profiles for select to authenticated
  using (id = auth.uid());

create policy "admin manages profiles" on profiles for all to authenticated
  using (
    client_id = (select client_id from auth_profile())
    and (select role from auth_profile()) = 'admin'
  );
```

**Step 3: Apply migration**

If using Supabase CLI locally: `supabase link --project-ref <ref>` then `supabase db push`.
Otherwise paste the SQL into the Supabase dashboard SQL editor and run it.

**Step 4: Verify tables exist**

In Supabase dashboard → Table Editor, confirm `clients`, `locations`, `negative_keywords`, `reviews`, `profiles` all exist with RLS enabled (shield icon).

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Supabase schema and RLS policies for survey system"
```

---

## Task 3: Types and Zod schemas

**Files:**
- Create: `lib/types.ts`
- Create: `lib/validation.ts`
- Test: `tests/validation.test.ts`

**Step 1: Write the failing test**

Create `tests/validation.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { reviewSubmitSchema } from "@/lib/validation";

describe("reviewSubmitSchema", () => {
  it("accepts a valid high-rating submission without a comment", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 5,
      comment: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects rating outside 1-5", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 6,
      comment: "",
    });
    expect(result.success).toBe(false);
  });

  it("requires a comment when rating is 3 or below", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 2,
      comment: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts rating 3 or below with a comment present", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 2,
      comment: "El servicio fue lento",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a comment longer than 1000 characters", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 5,
      comment: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/validation.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validation'`

**Step 3: Write types**

Create `lib/types.ts`:
```typescript
export type Classification = "good" | "bad";

export type Role = "admin" | "manager";

export interface Review {
  id: string;
  client_id: string;
  location_id: string;
  rating: number;
  comment: string | null;
  classification: Classification;
  matched_keywords: string[] | null;
  shared_to_google: boolean;
  created_at: string;
}

export interface Location {
  id: string;
  client_id: string;
  name: string;
  slug: string;
  google_place_id: string | null;
  created_at: string;
}
```

**Step 4: Write the schema**

Create `lib/validation.ts`:
```typescript
import { z } from "zod";

export const reviewSubmitSchema = z
  .object({
    locationSlug: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000),
  })
  .refine((data) => data.rating > 3 || data.comment.trim().length > 0, {
    message: "Comment is required for ratings of 3 or below",
    path: ["comment"],
  });
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/validation.test.ts`
Expected: PASS (5 tests)

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add review submission validation schema"
```

---

## Task 4: Classification logic

**Files:**
- Create: `lib/classify.ts`
- Test: `tests/classify.test.ts`

**Step 1: Write the failing test**

Create `tests/classify.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { classifyReview } from "@/lib/classify";

describe("classifyReview", () => {
  it("classifies 5 stars with no comment as good", () => {
    const result = classifyReview({ rating: 5, comment: "", negativeKeywords: ["lento", "sucio"] });
    expect(result).toEqual({ classification: "good", matchedKeywords: [] });
  });

  it("classifies 4 stars with a clean comment as good", () => {
    const result = classifyReview({
      rating: 4,
      comment: "Muy buena atencion",
      negativeKeywords: ["lento", "sucio"],
    });
    expect(result).toEqual({ classification: "good", matchedKeywords: [] });
  });

  it("classifies 3 stars as bad regardless of comment", () => {
    const result = classifyReview({ rating: 3, comment: "todo bien", negativeKeywords: [] });
    expect(result.classification).toBe("bad");
  });

  it("classifies 5 stars as bad when comment matches a negative keyword", () => {
    const result = classifyReview({
      rating: 5,
      comment: "El local estaba muy sucio",
      negativeKeywords: ["lento", "sucio"],
    });
    expect(result).toEqual({ classification: "bad", matchedKeywords: ["sucio"] });
  });

  it("keyword match is case-insensitive", () => {
    const result = classifyReview({
      rating: 5,
      comment: "Todo SUCIO y mal",
      negativeKeywords: ["sucio"],
    });
    expect(result.matchedKeywords).toEqual(["sucio"]);
  });

  it("collects all matched keywords, not just the first", () => {
    const result = classifyReview({
      rating: 5,
      comment: "lento y sucio",
      negativeKeywords: ["lento", "sucio", "caro"],
    });
    expect(result.matchedKeywords.sort()).toEqual(["lento", "sucio"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/classify.test.ts`
Expected: FAIL — `Cannot find module '@/lib/classify'`

**Step 3: Write minimal implementation**

Create `lib/classify.ts`:
```typescript
import type { Classification } from "@/lib/types";

interface ClassifyInput {
  rating: number;
  comment: string;
  negativeKeywords: string[];
}

interface ClassifyResult {
  classification: Classification;
  matchedKeywords: string[];
}

export function classifyReview({ rating, comment, negativeKeywords }: ClassifyInput): ClassifyResult {
  const commentLower = comment.toLowerCase();
  const matchedKeywords = negativeKeywords.filter((keyword) =>
    commentLower.includes(keyword.toLowerCase())
  );

  const classification: Classification =
    rating >= 4 && matchedKeywords.length === 0 ? "good" : "bad";

  return { classification, matchedKeywords };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/classify.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add review classification logic"
```

---

## Task 5: Public review page

**Files:**
- Create: `app/r/[locationSlug]/page.tsx`
- Create: `app/r/[locationSlug]/review-form.tsx`
- Create: `app/r/[locationSlug]/actions.ts`
- Create: `app/r/[locationSlug]/not-found.tsx`

**Step 1: Server action to submit a review**

Create `app/r/[locationSlug]/actions.ts`:
```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reviewSubmitSchema } from "@/lib/validation";
import { classifyReview } from "@/lib/classify";

export async function submitReview(formData: FormData) {
  const parsed = reviewSubmitSchema.safeParse({
    locationSlug: formData.get("locationSlug"),
    rating: Number(formData.get("rating")),
    comment: formData.get("comment") ?? "",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid submission");
  }

  const { locationSlug, rating, comment } = parsed.data;
  const supabase = await createClient();

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id, client_id")
    .eq("slug", locationSlug)
    .single();

  if (locationError || !location) {
    throw new Error("Location not found");
  }

  const { data: keywordRows } = await supabase
    .from("negative_keywords")
    .select("keyword")
    .eq("client_id", location.client_id);

  const { classification, matchedKeywords } = classifyReview({
    rating,
    comment,
    negativeKeywords: (keywordRows ?? []).map((row) => row.keyword),
  });

  const { error: insertError } = await supabase.from("reviews").insert({
    client_id: location.client_id,
    location_id: location.id,
    rating,
    comment: comment || null,
    classification,
    matched_keywords: matchedKeywords.length > 0 ? matchedKeywords : null,
  });

  if (insertError) {
    throw new Error("Could not save review");
  }

  redirect(`/r/${locationSlug}/gracias?c=${classification}`);
}
```

**Step 2: Review form (client component)**

Create `app/r/[locationSlug]/review-form.tsx`:
```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "./actions";

export function ReviewForm({ locationSlug }: { locationSlug: string }) {
  const [rating, setRating] = useState(0);
  const [pending, setPending] = useState(false);
  const commentRequired = rating > 0 && rating <= 3;

  return (
    <form
      action={async (formData) => {
        setPending(true);
        await submitReview(formData);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="locationSlug" value={locationSlug} />
      <input type="hidden" name="rating" value={rating} />

      <div className="flex gap-2 justify-center" role="radiogroup" aria-label="Calificacion">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} estrellas`}
            aria-pressed={rating === star}
            onClick={() => setRating(star)}
            className={`text-4xl transition-colors ${star <= rating ? "text-yellow-400" : "text-muted-foreground"}`}
          >
            ★
          </button>
        ))}
      </div>

      <Textarea
        name="comment"
        placeholder={commentRequired ? "Contanos que paso (requerido)" : "Contanos tu experiencia (opcional)"}
        required={commentRequired}
      />

      <Button type="submit" disabled={rating === 0 || pending}>
        {pending ? "Enviando..." : "Enviar"}
      </Button>
    </form>
  );
}
```

**Step 3: Page (server component, loads location)**

Create `app/r/[locationSlug]/page.tsx`:
```typescript
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewForm } from "./review-form";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locationSlug: string }>;
}) {
  const { locationSlug } = await params;
  const supabase = await createClient();

  const { data: location } = await supabase
    .from("locations")
    .select("id, name")
    .eq("slug", locationSlug)
    .single();

  if (!location) {
    notFound();
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <h1 className="text-2xl font-semibold text-center">{location.name}</h1>
      <p className="text-muted-foreground text-center">Cual fue tu experiencia hoy?</p>
      <div className="w-full max-w-sm">
        <ReviewForm locationSlug={locationSlug} />
      </div>
    </main>
  );
}
```

**Step 4: 404 for unknown location slug**

Create `app/r/[locationSlug]/not-found.tsx`:
```typescript
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-2 text-center">
      <h1 className="text-2xl font-semibold">Local no encontrado</h1>
      <p className="text-muted-foreground">Revisa el codigo QR o contacta al local.</p>
    </main>
  );
}
```

**Step 5: Manual verification in browser**

Insert a test client + location directly in Supabase Table Editor (or SQL editor):
```sql
insert into clients (name, slug) values ('Cliente Demo', 'demo');
insert into locations (client_id, name, slug)
  select id, 'Local Centro', 'centro' from clients where slug = 'demo';
```
Run `npm run dev`, open `http://localhost:3000/r/centro`, submit a review with 5 stars, confirm redirect to `/r/centro/gracias?c=good`. Try `http://localhost:3000/r/no-existe`, confirm 404 page renders.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add public review submission page"
```

---

## Task 6: Thank-you page with Google share

**Files:**
- Create: `app/r/[locationSlug]/gracias/page.tsx`
- Create: `app/r/[locationSlug]/gracias/share-google.tsx`
- Create: `app/r/[locationSlug]/gracias/actions.ts`

**Step 1: Server action to mark a review as shared**

Create `app/r/[locationSlug]/gracias/actions.ts`:
```typescript
"use server";

import { createClient } from "@/lib/supabase/server";

export async function markSharedToGoogle(reviewId: string) {
  const supabase = await createClient();
  await supabase.from("reviews").update({ shared_to_google: true }).eq("id", reviewId);
}
```

Note: this requires the client to know its own `reviewId`. Simplify by not tracking per-review click-through in v1 — instead just render the share UI keyed off the `good` classification. Skip `markSharedToGoogle` for now; **do not create `actions.ts`** in this task. (Rationale: passing the raw review id through a public URL query param is an unnecessary IDOR-shaped surface for a nice-to-have metric. Revisit if the "% shared to Google" metric is required — see Task 10 note.)

**Step 2: Share component (client component, clipboard)**

Create `app/r/[locationSlug]/gracias/share-google.tsx`:
```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareGoogle({ googlePlaceId, comment }: { googlePlaceId: string; comment: string }) {
  const [copied, setCopied] = useState(false);
  const reviewUrl = `https://search.google.com/local/writereview?placeid=${googlePlaceId}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(comment);
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-3 items-center">
      <p className="text-center text-muted-foreground">
        Te gustaria compartir tu opinion en Google?
      </p>
      <div className="flex gap-2">
        {comment && (
          <Button variant="outline" onClick={handleCopy}>
            {copied ? "Copiado!" : "Copiar mi review"}
          </Button>
        )}
        <Button asChild>
          <a href={reviewUrl} target="_blank" rel="noopener noreferrer">
            Abrir Google
          </a>
        </Button>
      </div>
    </div>
  );
}
```

**Step 3: Thank-you page**

Create `app/r/[locationSlug]/gracias/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server";
import { ShareGoogle } from "./share-google";

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationSlug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { locationSlug } = await params;
  const { c } = await searchParams;
  const isGood = c === "good";

  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("google_place_id")
    .eq("slug", locationSlug)
    .single();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <h1 className="text-2xl font-semibold text-center">Gracias por tu opinion!</h1>
      {isGood && location?.google_place_id ? (
        <ShareGoogle googlePlaceId={location.google_place_id} comment="" />
      ) : (
        <p className="text-muted-foreground text-center">
          Tu feedback nos ayuda a mejorar cada dia.
        </p>
      )}
    </main>
  );
}
```

Note: the "Copiar mi review" button needs the actual comment text, which this page doesn't have (only the classification came through the URL). **Fix before considering this task done:** pass the comment through as a second query param instead of fetching it back from the DB (avoids a second round trip and avoids exposing review rows to `anon` reads). Update `actions.ts` in Task 5 to redirect with `&comment=<encoded comment>` when classification is good, and read `searchParams.comment` here, passing it to `<ShareGoogle comment={comment ?? ""} />`. Keep the URL param short — comments are capped at 1000 chars by validation already.

**Step 4: Manual verification in browser**

Resubmit a review with 5 stars and a comment at `/r/centro`, confirm the thank-you page shows "Copiar mi review" + "Abrir Google" and that copy actually puts the comment on the clipboard. Submit a 2-star review, confirm thank-you page shows only the plain thank-you message, no Google CTA.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add thank-you page with Google review share flow"
```

---

## Task 7: Auth — login page and logout

**Files:**
- Create: `app/dashboard/login/page.tsx`
- Create: `app/dashboard/login/actions.ts`
- Create: `app/dashboard/actions.ts` (logout)

**Step 1: Login server action**

Create `app/dashboard/login/actions.ts`:
```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/dashboard/login?error=1");
  }

  redirect("/dashboard");
}
```

**Step 2: Login page**

Create `app/dashboard/login/page.tsx`:
```typescript
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form action={login} className="w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-center">Iniciar sesion</h1>
        {error && <p className="text-destructive text-sm text-center">Email o password incorrectos</p>}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit">Entrar</Button>
      </form>
    </main>
  );
}
```

**Step 3: Logout action**

Create `app/dashboard/actions.ts`:
```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/dashboard/login");
}
```

**Step 4: Create a first admin user**

In Supabase dashboard → Authentication → Users → Add user, create an admin with email/password. Then insert their profile row via SQL editor:
```sql
insert into profiles (id, client_id, role)
  select u.id, c.id, 'admin'
  from auth.users u, clients c
  where u.email = 'admin@example.com' and c.slug = 'demo';
```

**Step 5: Manual verification in browser**

Go to `http://localhost:3000/dashboard` while logged out — confirm middleware redirects to `/dashboard/login`. Log in with the admin credentials, confirm redirect to `/dashboard` (page doesn't exist yet — 404 is expected until Task 8, but no auth redirect loop should happen).

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add dashboard login and logout"
```

---

## Task 8: Dashboard layout and profile lookup helper

**Files:**
- Create: `lib/get-profile.ts`
- Create: `app/dashboard/layout.tsx`
- Test: `tests/get-profile.test.ts` (skip — this is a thin DB-fetch wrapper, no branching logic worth unit testing in isolation; verified via manual browser check instead, per this project's testing convention of logic-only unit tests)

**Step 1: Profile lookup helper**

Create `lib/get-profile.ts`:
```typescript
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export interface Profile {
  clientId: string;
  role: Role;
  locationId: string | null;
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("client_id, role, location_id")
    .eq("id", user.id)
    .single();

  if (!data) return null;

  return { clientId: data.client_id, role: data.role as Role, locationId: data.location_id };
}
```

**Step 2: Dashboard layout with nav + no-access guard**

Create `app/dashboard/layout.tsx`:
```typescript
import Link from "next/link";
import { getProfile } from "@/lib/get-profile";
import { logout } from "./actions";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();

  if (!profile) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4">
        <p>No tenes acceso a este dashboard.</p>
        <form action={logout}>
          <Button type="submit" variant="outline">Cerrar sesion</Button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b p-4 flex justify-between items-center">
        <nav className="flex gap-4">
          <Link href="/dashboard">Metricas</Link>
          <Link href="/dashboard/reviews">Reviews</Link>
          {profile.role === "admin" && <Link href="/dashboard/config">Config</Link>}
        </nav>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">Cerrar sesion</Button>
        </form>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

**Step 3: Manual verification in browser**

Log in as the admin created in Task 7, confirm the header renders with "Metricas / Reviews / Config" links and a working "Cerrar sesion" button that returns you to the login page.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add dashboard layout with nav and access guard"
```

---

## Task 9: Dashboard home — metrics

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `app/dashboard/location-filter.tsx`
- Create: `lib/metrics.ts`
- Test: `tests/metrics.test.ts`

**Step 1: Write the failing test for the pure aggregation function**

Create `tests/metrics.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { summarizeReviews } from "@/lib/metrics";
import type { Review } from "@/lib/types";

function makeReview(overrides: Partial<Review>): Review {
  return {
    id: "1",
    client_id: "c1",
    location_id: "l1",
    rating: 5,
    comment: null,
    classification: "good",
    matched_keywords: null,
    shared_to_google: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("summarizeReviews", () => {
  it("returns zeroed metrics for an empty list", () => {
    const result = summarizeReviews([]);
    expect(result).toEqual({
      total: 0,
      averageRating: 0,
      goodPercent: 0,
      badPercent: 0,
      sharedPercent: 0,
      starDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it("computes average rating and good/bad split", () => {
    const reviews = [
      makeReview({ rating: 5, classification: "good" }),
      makeReview({ rating: 1, classification: "bad" }),
    ];
    const result = summarizeReviews(reviews);
    expect(result.total).toBe(2);
    expect(result.averageRating).toBe(3);
    expect(result.goodPercent).toBe(50);
    expect(result.badPercent).toBe(50);
  });

  it("computes shared-to-google percent", () => {
    const reviews = [
      makeReview({ shared_to_google: true }),
      makeReview({ shared_to_google: false }),
    ];
    const result = summarizeReviews(reviews);
    expect(result.sharedPercent).toBe(50);
  });

  it("builds star distribution counts", () => {
    const reviews = [makeReview({ rating: 5 }), makeReview({ rating: 5 }), makeReview({ rating: 2 })];
    const result = summarizeReviews(reviews);
    expect(result.starDistribution).toEqual({ 1: 0, 2: 1, 3: 0, 4: 0, 5: 2 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/metrics.test.ts`
Expected: FAIL — `Cannot find module '@/lib/metrics'`

**Step 3: Write minimal implementation**

Create `lib/metrics.ts`:
```typescript
import type { Review } from "@/lib/types";

export interface ReviewSummary {
  total: number;
  averageRating: number;
  goodPercent: number;
  badPercent: number;
  sharedPercent: number;
  starDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function summarizeReviews(reviews: Review[]): ReviewSummary {
  const total = reviews.length;
  const starDistribution: ReviewSummary["starDistribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  if (total === 0) {
    return { total: 0, averageRating: 0, goodPercent: 0, badPercent: 0, sharedPercent: 0, starDistribution };
  }

  let ratingSum = 0;
  let goodCount = 0;
  let sharedCount = 0;

  for (const review of reviews) {
    ratingSum += review.rating;
    if (review.classification === "good") goodCount += 1;
    if (review.shared_to_google) sharedCount += 1;
    starDistribution[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
  }

  return {
    total,
    averageRating: Math.round((ratingSum / total) * 10) / 10,
    goodPercent: Math.round((goodCount / total) * 100),
    badPercent: Math.round(((total - goodCount) / total) * 100),
    sharedPercent: Math.round((sharedCount / total) * 100),
    starDistribution,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/metrics.test.ts`
Expected: PASS (4 tests)

**Step 5: Location filter (client component, admin only)**

Create `app/dashboard/location-filter.tsx`:
```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LocationFilter({ locations }: { locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("location") ?? "all";

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams);
        if (value === "all") params.delete("location");
        else params.set("location", value);
        router.push(`?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los locales</SelectItem>
        {locations.map((loc) => (
          <SelectItem key={loc.id} value={loc.id}>
            {loc.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

**Step 6: Dashboard home page**

Create `app/dashboard/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { summarizeReviews } from "@/lib/metrics";
import { LocationFilter } from "./location-filter";
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Metricas</h1>
        {profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total reviews" value={summary.total} />
        <MetricCard label="Rating promedio" value={summary.averageRating.toFixed(1)} />
        <MetricCard label="% Buenas" value={`${summary.goodPercent}%`} />
        <MetricCard label="% Compartidas a Google" value={`${summary.sharedPercent}%`} />
      </div>

      <div>
        <h2 className="text-lg font-medium mb-2">Distribucion de estrellas</h2>
        <div className="flex gap-2 items-end h-40">
          {([1, 2, 3, 4, 5] as const).map((star) => (
            <div key={star} className="flex flex-col items-center gap-1 flex-1">
              <div
                className="bg-primary w-full rounded-t"
                style={{
                  height: `${summary.total > 0 ? (summary.starDistribution[star] / summary.total) * 100 : 0}%`,
                }}
              />
              <span className="text-sm text-muted-foreground">{star}★</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
```

Note: `shared_to_google` percent will always read 0% until Task 6's "fix before done" note is resolved (tracking shares requires knowing the review id — revisit together, this plan intentionally deferred it to avoid an insecure public endpoint. Simplest safe fix: have the "Abrir Google" link on the thank-you page hit a route handler `/api/reviews/[id]/mark-shared` scoped by a short-lived signed token embedded in the redirect URL, rather than a raw id. Do this as a follow-up task if the metric turns out to matter to the client — YAGNI for now, ship without it and note it as a known gap).

**Step 7: Manual verification in browser**

Log in as admin, confirm `/dashboard` shows correct totals matching what you've submitted via `/r/centro`. Switch the location filter, confirm numbers update via URL param.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add dashboard home with review metrics"
```

---

## Task 10: Dashboard reviews list, filters, CSV export

**Files:**
- Create: `app/dashboard/reviews/page.tsx`
- Create: `app/dashboard/reviews/reviews-table.tsx`
- Create: `lib/csv.ts`
- Test: `tests/csv.test.ts`

**Step 1: Write the failing test**

Create `tests/csv.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { reviewsToCsv } from "@/lib/csv";
import type { Review } from "@/lib/types";

describe("reviewsToCsv", () => {
  it("returns header only for empty input", () => {
    const csv = reviewsToCsv([]);
    expect(csv).toBe("fecha,rating,clasificacion,comentario,keywords\n");
  });

  it("formats a row with a comment and matched keywords", () => {
    const review: Review = {
      id: "1",
      client_id: "c1",
      location_id: "l1",
      rating: 2,
      comment: "muy lento",
      classification: "bad",
      matched_keywords: ["lento"],
      shared_to_google: false,
      created_at: "2026-01-15T10:00:00.000Z",
    };
    const csv = reviewsToCsv([review]);
    expect(csv).toBe('fecha,rating,clasificacion,comentario,keywords\n2026-01-15,2,bad,"muy lento",lento\n');
  });

  it("escapes commas and quotes inside comments", () => {
    const review: Review = {
      id: "1",
      client_id: "c1",
      location_id: "l1",
      rating: 5,
      comment: 'Buenisimo, todo "perfecto"',
      classification: "good",
      matched_keywords: null,
      shared_to_google: false,
      created_at: "2026-01-15T10:00:00.000Z",
    };
    const csv = reviewsToCsv([review]);
    expect(csv).toContain('"Buenisimo, todo ""perfecto"""');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/csv.test.ts`
Expected: FAIL — `Cannot find module '@/lib/csv'`

**Step 3: Write minimal implementation**

Create `lib/csv.ts`:
```typescript
import type { Review } from "@/lib/types";

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function reviewsToCsv(reviews: Review[]): string {
  const header = "fecha,rating,clasificacion,comentario,keywords\n";
  const rows = reviews.map((review) => {
    const date = review.created_at.slice(0, 10);
    const comment = escapeCsvField(review.comment ?? "");
    const keywords = (review.matched_keywords ?? []).join(";");
    return `${date},${review.rating},${review.classification},${comment},${keywords}`;
  });
  return header + rows.map((row) => `${row}\n`).join("");
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/csv.test.ts`
Expected: PASS (3 tests)

**Step 5: Reviews table with filters + export button (client component)**

Create `app/dashboard/reviews/reviews-table.tsx`:
```typescript
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reviewsToCsv } from "@/lib/csv";
import type { Review } from "@/lib/types";

export function ReviewsTable({ reviews }: { reviews: Review[] }) {
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
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleExport} disabled={reviews.length === 0}>
          Exportar CSV
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Fecha</th>
            <th className="p-2">Rating</th>
            <th className="p-2">Clasificacion</th>
            <th className="p-2">Comentario</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.id} className="border-b">
              <td className="p-2">{review.created_at.slice(0, 10)}</td>
              <td className="p-2">{review.rating}★</td>
              <td className="p-2">
                <Badge variant={review.classification === "good" ? "default" : "destructive"}>
                  {review.classification}
                </Badge>
              </td>
              <td className="p-2">{review.comment ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {reviews.length === 0 && <p className="text-muted-foreground text-center py-8">Sin reviews todavia.</p>}
    </div>
  );
}
```

**Step 6: Reviews page (server component, applies filters via query params)**

Create `app/dashboard/reviews/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { ReviewsTable } from "./reviews-table";
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Reviews</h1>
      <ReviewsTable reviews={(reviews ?? []) as Review[]} />
    </div>
  );
}
```

Filter UI (dropdowns for location/classification/date range) can reuse the `LocationFilter` pattern from Task 9 — add as a follow-up polish pass once the base list works; not blocking for a usable v1 (filters work via URL params already, just no picker UI yet for classification/date).

**Step 7: Manual verification in browser**

Go to `/dashboard/reviews`, confirm all submitted reviews show up. Click "Exportar CSV", confirm a file downloads and opens correctly in a spreadsheet app with the right columns.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add dashboard reviews list with CSV export"
```

---

## Task 11: Dashboard config — locations, keywords, QR generator

**Files:**
- Create: `app/dashboard/config/page.tsx`
- Create: `app/dashboard/config/locations-section.tsx`
- Create: `app/dashboard/config/keywords-section.tsx`
- Create: `app/dashboard/config/actions.ts`
- Create: `lib/qr.ts`
- Test: `tests/qr.test.ts`

**Step 1: Write the failing test for the QR URL builder (the only pure logic here — actual PNG generation is a thin wrapper around the `qrcode` library, not worth mocking/testing)**

Create `tests/qr.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { buildReviewUrl } from "@/lib/qr";

describe("buildReviewUrl", () => {
  it("builds the public review URL for a location slug", () => {
    expect(buildReviewUrl("https://survey.example.com", "centro")).toBe(
      "https://survey.example.com/r/centro"
    );
  });

  it("strips a trailing slash from the base url", () => {
    expect(buildReviewUrl("https://survey.example.com/", "centro")).toBe(
      "https://survey.example.com/r/centro"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/qr.test.ts`
Expected: FAIL — `Cannot find module '@/lib/qr'`

**Step 3: Write minimal implementation**

Create `lib/qr.ts`:
```typescript
import QRCode from "qrcode";

export function buildReviewUrl(baseUrl: string, locationSlug: string): string {
  return `${baseUrl.replace(/\/$/, "")}/r/${locationSlug}`;
}

export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 512, margin: 2 });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/qr.test.ts`
Expected: PASS (2 tests)

**Step 5: Config server actions (admin-only CRUD)**

Create `app/dashboard/config/actions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";

async function requireAdmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");
  return profile;
}

export async function createLocation(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("locations").insert({
    client_id: profile.clientId,
    name: String(formData.get("name")),
    slug: String(formData.get("slug")),
    google_place_id: String(formData.get("googlePlaceId") || "") || null,
  });
  revalidatePath("/dashboard/config");
}

export async function deleteLocation(locationId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("locations").delete().eq("id", locationId);
  revalidatePath("/dashboard/config");
}

export async function createKeyword(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("negative_keywords").insert({
    client_id: profile.clientId,
    keyword: String(formData.get("keyword")),
  });
  revalidatePath("/dashboard/config");
}

export async function deleteKeyword(keywordId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("negative_keywords").delete().eq("id", keywordId);
  revalidatePath("/dashboard/config");
}
```

**Step 6: Locations section with QR download**

Create `app/dashboard/config/locations-section.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildReviewUrl, generateQrDataUrl } from "@/lib/qr";
import { createLocation, deleteLocation } from "./actions";
import type { Location } from "@/lib/types";

export function LocationsSection({ locations }: { locations: Location[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Locales</h2>
      <form action={createLocation} className="flex gap-2 flex-wrap items-end">
        <Input name="name" placeholder="Nombre" required className="w-40" />
        <Input name="slug" placeholder="slug (ej: centro)" required className="w-40" />
        <Input name="googlePlaceId" placeholder="Google Place ID (opcional)" className="w-56" />
        <Button type="submit">Agregar</Button>
      </form>
      <div className="flex flex-col gap-2">
        {locations.map((loc) => (
          <LocationRow key={loc.id} location={loc} />
        ))}
      </div>
    </div>
  );
}

function LocationRow({ location }: { location: Location }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = buildReviewUrl(window.location.origin, location.slug);
    generateQrDataUrl(url).then(setQrDataUrl);
  }, [location.slug]);

  return (
    <div className="flex items-center gap-4 border rounded-lg p-3">
      {qrDataUrl && <img src={qrDataUrl} alt={`QR ${location.name}`} className="w-16 h-16" />}
      <div className="flex-1">
        <p className="font-medium">{location.name}</p>
        <p className="text-sm text-muted-foreground">/r/{location.slug}</p>
      </div>
      {qrDataUrl && (
        <a href={qrDataUrl} download={`qr-${location.slug}.png`}>
          <Button variant="outline" size="sm">Descargar QR</Button>
        </a>
      )}
      <Button variant="ghost" size="sm" onClick={() => deleteLocation(location.id)}>
        Eliminar
      </Button>
    </div>
  );
}
```

**Step 7: Keywords section**

Create `app/dashboard/config/keywords-section.tsx`:
```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createKeyword, deleteKeyword } from "./actions";

interface Keyword {
  id: string;
  keyword: string;
}

export function KeywordsSection({ keywords }: { keywords: Keyword[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Palabras clave negativas</h2>
      <form action={createKeyword} className="flex gap-2">
        <Input name="keyword" placeholder="ej: lento, sucio, frio" required className="w-64" />
        <Button type="submit">Agregar</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw) => (
          <span key={kw.id} className="flex items-center gap-1 border rounded-full px-3 py-1 text-sm">
            {kw.keyword}
            <button onClick={() => deleteKeyword(kw.id)} className="text-muted-foreground hover:text-destructive">
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
```

**Step 8: Config page (admin-only, redirects managers)**

Create `app/dashboard/config/page.tsx`:
```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { LocationsSection } from "./locations-section";
import { KeywordsSection } from "./keywords-section";

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
      <h1 className="text-2xl font-semibold">Configuracion</h1>
      <LocationsSection locations={locations ?? []} />
      <KeywordsSection keywords={keywords ?? []} />
    </div>
  );
}
```

Note: user management CRUD (inviting managers) is deferred — v1 admin creates manager accounts manually via Supabase dashboard (Task 7's process, with `role: 'manager'` and `location_id` set). Revisit as a follow-up task once the base flow is validated with the client; not needed to ship a working v1.

**Step 9: Manual verification in browser**

As admin, go to `/dashboard/config`, add a new location, confirm it appears with a scannable QR that downloads as PNG and links to a working `/r/[slug]` page. Add a negative keyword, then submit a review through the public form containing that word with 5 stars, confirm it gets classified `bad` on the reviews page. Log in as a manager (create one via Supabase dashboard), confirm `/dashboard/config` redirects them to `/dashboard`.

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add dashboard config for locations, keywords, and QR generation"
```

---

## Task 12: Rate limiting on public review submission

**Files:**
- Modify: `middleware.ts`
- Create: `lib/rate-limit.ts`
- Test: `tests/rate-limit.test.ts`

**Step 1: Write the failing test**

Create `tests/rate-limit.test.ts`:
```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { isRateLimited } from "@/lib/rate-limit";

describe("isRateLimited", () => {
  beforeEach(() => {
    // fresh in-memory state per test via a distinct key
  });

  it("allows the first request from an IP", () => {
    expect(isRateLimited(`test-ip-${Date.now()}-a`)).toBe(false);
  });

  it("blocks a second request within the window", () => {
    const ip = `test-ip-${Date.now()}-b`;
    expect(isRateLimited(ip)).toBe(false);
    expect(isRateLimited(ip)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/rate-limit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rate-limit'`

**Step 3: Write minimal implementation**

Create `lib/rate-limit.ts`:
```typescript
const WINDOW_MS = 60_000;
const lastSubmission = new Map<string, number>();

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const last = lastSubmission.get(ip);
  lastSubmission.set(ip, now);
  return last !== undefined && now - last < WINDOW_MS;
}
```

Note: this is an in-memory, single-instance limiter — fine for a v1 deployed to a single Vercel region/instance count expected here (low traffic, one client). If this becomes a real bottleneck or the deploy scales to multiple instances, swap for Vercel KV or Upstash Redis — not needed now (YAGNI).

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/rate-limit.test.ts`
Expected: PASS (2 tests)

**Step 5: Wire into the submit action**

Modify `app/r/[locationSlug]/actions.ts` — add near the top of `submitReview`, after the `parsed` validation:
```typescript
import { headers } from "next/headers";
import { isRateLimited } from "@/lib/rate-limit";
```
```typescript
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) {
    throw new Error("Espera un momento antes de enviar otra review");
  }
```
(Insert this block right after the `if (!parsed.success)` check, before destructuring `parsed.data`.)

**Step 6: Manual verification in browser**

Submit a review at `/r/centro`, then immediately submit a second one — confirm the second attempt throws/fails visibly (Next.js will show an error boundary; that's acceptable for v1, this is an abuse guard not a UX path). Wait 60+ seconds, confirm a third submission succeeds.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add basic rate limiting to public review submission"
```

---

## Task 13: Full manual QA pass

**Files:** none — verification only

**Step 1: End-to-end happy path**

1. Start `npm run dev`.
2. Scan/visit QR URL for a location → submit 5 stars, no comment → thank-you page shows Google share CTA → click "Abrir Google" → confirm it opens Google's write-review dialog for the right place.
3. Submit 2 stars with a comment → thank-you page shows plain thank-you, no Google CTA.
4. Submit 5 stars with a comment containing a configured negative keyword → confirm it's classified `bad` (check `/dashboard/reviews`).
5. Log into `/dashboard` as admin → confirm metrics match what was just submitted.
6. Switch location filter (if multiple locations exist) → confirm metrics update.
7. Go to `/dashboard/reviews` → export CSV → open it, confirm rows/columns are correct.
8. Go to `/dashboard/config` → add a location → confirm QR downloads and scans to the right URL (test by opening the downloaded PNG's URL manually, or scanning with a phone).
9. Add/remove a negative keyword → confirm it takes effect on the next submission.
10. Log in as a manager (scoped to one location) → confirm they only see their location's data everywhere and can't reach `/dashboard/config`.
11. Log out → confirm `/dashboard` redirects to login.

**Step 2: Record any gaps found**

If anything fails, file it as a follow-up — do not silently patch without going back through the plan/design if it's a scope change.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: complete manual QA pass for v1 survey system"
```

---

## Known deferred items (documented, not silently dropped)

- `shared_to_google` tracking is not wired up (Task 9 note) — metric will always show 0% until a follow-up task implements a safe (signed-token) way to mark it.
- Reviews-page filter UI for classification/date range is URL-param-only, no picker widgets yet (Task 10 note).
- User/manager invite flow is manual via Supabase dashboard, no CRUD UI (Task 11 note).
- Negative-review email/WhatsApp alerts: out of scope per design doc.
- Real branding (logo, colors): out of scope until client shares identity — `clients.logo_url`/`primary_color` columns exist and are ready to wire into a theme once assets arrive.
