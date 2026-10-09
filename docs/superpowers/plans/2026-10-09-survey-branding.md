# Survey branding (logo, restaurant name, location name) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public survey page shows the client's logo, the restaurant (client) name and the location name; the agency uploads the logo from the client's Settings tab.

**Architecture:** Migration `0013` creates a public Supabase Storage bucket `client-logos` and widens `get_public_location` to return `client_name` and `client_logo_url`. A superadmin-only server action validates the upload (size, real image type by magic bytes) and stores it with the service-role client, recording the public URL in `clients.logo_url`. The survey page renders the branding header. The CSP `img-src` gains the Supabase origin.

**Tech Stack:** Next.js 16 (server actions, `useActionState`), Supabase Storage + Postgres RPC, Zod 4, Vitest 5.

**Design (approved in chat 2026-10-09, bounded path, no spec file):**
- Survey page order, top to bottom: logo (centered, max height 64px), restaurant name, location name (smaller), then "How was your experience today?" and the emoji form. No logo → omit it. Restaurant name equal to location name (case-insensitive) → show one.
- Bucket `client-logos`: public read, 2 MB limit, PNG/JPEG/WebP only (no SVG: scriptable). Writes only through the service role.
- Deploy order: apply `0013` first, then deploy the code. New code without `0013` still renders (no logo/restaurant name).
- Out of scope: thank-you page `/t`, tenant dashboard, `primary_color`.

## Global Constraints

- Branch `feat/multi-tenant-admin`, worktree `/Users/ventura/Desktop/d/atrium/survey.dcop.atrium-mt`. Do not push.
- Every superadmin action calls `await requireSuperadmin()` as its FIRST statement.
- `security definer` functions use `set search_path = ''` and `public.`-qualified names.
- The public RPC exposes only what the visitor sees (location name, review link, client name, client logo URL).
- The service-role key stays server-only; no "use client" file imports `lib/supabase/admin`. A `"use server"` file exports only async functions.
- Verification: `npx tsc --noEmit` (clean), `npm test`, `npx eslint "app/dashboard/(protected)" "app/r" lib tests components` (two `<img>` warnings are accepted; new `<img>` warnings from this work are acceptable only on the logo tags).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- The upload action rejects non-superadmins before touching Storage, rejects >2 MB, rejects files whose bytes are not PNG/JPEG/WebP even if the browser-reported type says otherwise, and never leaves an orphaned object when the DB update fails (Task 2).
- The CSP actually permits the logo image from Supabase on the survey page and in the Settings preview (Task 1).
- The survey page still renders when the RPC returns null client fields (migration not applied, or no logo) (Task 1).
- Replacing a logo deletes the previous object; removing a logo clears the URL (Task 2).

---

### Task 1: Migration, CSP and survey page

**Files:**
- Create: `supabase/migrations/0013_client_branding.sql`
- Modify: `next.config.ts` (CSP `img-src`, server action body limit)
- Modify: `app/r/[locationSlug]/page.tsx`
- Modify: `supabase/tests/rls_isolation.sql` (one assertion)

**Interfaces:**
- Produces: SQL `public.get_public_location(p_slug text)` returning `table (id uuid, name text, google_review_url text, client_name text, client_logo_url text)`; Storage bucket `client-logos`.

- [ ] **Step 1: Migration** `supabase/migrations/0013_client_branding.sql`:

```sql
-- 0013: Client branding for the public survey page.
--
-- 1) Public Storage bucket for client logos. Reads are public by URL; there are
--    no policies on storage.objects, so anon cannot list or write. Uploads go
--    through the service role from the superadmin panel.
-- 2) get_public_location also returns the client's name and logo URL.
--    The return type changes, so the function must be dropped and recreated.
--    Apply BEFORE deploying the app version that reads the new columns.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-logos', 'client-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop function if exists public.get_public_location(text);

create function public.get_public_location(p_slug text)
returns table (id uuid, name text, google_review_url text, client_name text, client_logo_url text)
language sql
security definer
stable
set search_path = ''
as $$
  select l.id, l.name, l.google_review_url, c.name, c.logo_url
  from public.locations l
  join public.clients c on c.id = l.client_id
  where l.slug = p_slug
  limit 1;
$$;

revoke all on function public.get_public_location(text) from public;
grant execute on function public.get_public_location(text) to anon, authenticated;
```

- [ ] **Step 2: `next.config.ts`**
  - Change the CSP line `"img-src 'self' data: blob:"` to be built from a list: define `const imgSrc = ["'self'", "data:", "blob:"]; if (process.env.NEXT_PUBLIC_SUPABASE_URL) imgSrc.push(process.env.NEXT_PUBLIC_SUPABASE_URL);` next to `connectSrc`, and use `` `img-src ${imgSrc.join(" ")}` ``.
  - Add to `nextConfig`: `experimental: { serverActions: { bodySizeLimit: "3mb" } },` (logo uploads are up to 2 MB; the default limit is 1 MB).

- [ ] **Step 3: Survey page.** In `app/r/[locationSlug]/page.tsx` change the `.single<…>()` generic to
`{ id: string; name: string; google_review_url: string | null; client_name?: string | null; client_logo_url?: string | null }` and replace the `<h1>` block so the main content becomes:

```tsx
  const restaurantName = location.client_name?.trim() || null;
  const showRestaurant = restaurantName && restaurantName.toLowerCase() !== location.name.trim().toLowerCase();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-cream">
      <header className="flex flex-col items-center gap-2 text-center">
        {location.client_logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={location.client_logo_url}
            alt={restaurantName ?? location.name}
            className="max-h-16 w-auto object-contain"
          />
        )}
        {showRestaurant && (
          <h1 className="text-2xl font-medium text-ink tracking-tight">{restaurantName}</h1>
        )}
        {showRestaurant ? (
          <p className="text-lg text-body">{location.name}</p>
        ) : (
          <h1 className="text-2xl font-medium text-ink tracking-tight">{location.name}</h1>
        )}
      </header>
      <p className="text-body text-center text-lg">How was your experience today?</p>
      <div className="w-full max-w-sm">
        <ReviewForm locationSlug={locationSlug} />
      </div>
    </main>
  );
```

(Keep the existing `after(...)` QR-scan block and everything above the return unchanged; there must be exactly one `<h1>` rendered.)

- [ ] **Step 4: SQL test assertion.** In `supabase/tests/rls_isolation.sql`, inside the anon `do $$ … end $$;` block, after the existing RPC assertions add:

```sql
  if (select client_name from public.get_public_location('rls-a1')) <> 'RLS Client A' then raise exception 'rpc: wrong client_name'; end if;
  if (select client_logo_url from public.get_public_location('rls-a1')) is not null then raise exception 'rpc: unexpected client_logo_url'; end if;
```

(The file needs migration 0013 applied; update its header comment to "0001-0013". No database is available to run it: do not claim it was run.)

- [ ] **Step 5: Verify:** `npx tsc --noEmit && npm test && npx eslint "app/r" lib tests`. Expected clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0013_client_branding.sql next.config.ts "app/r/[locationSlug]/page.tsx" supabase/tests/rls_isolation.sql
git commit -m "feat: show client logo, restaurant name and location name on the survey page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Logo upload and removal actions

**Files:**
- Create: `lib/image-type.ts`
- Modify: `app/dashboard/(protected)/admin/actions.ts` (append two actions)
- Test: `tests/image-type.test.ts`, `tests/admin-logo-actions.test.ts`

**Interfaces:**
- Consumes: `requireSuperadmin`, `createAdminClient`, `ActionResult`, `userIdSchema`/`z.uuid()`.
- Produces:
  - `detectImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null`
  - `LOGO_MAX_BYTES = 2 * 1024 * 1024` and `LOGO_EXTENSIONS: Record<"image/png"|"image/jpeg"|"image/webp", string>` exported from `lib/image-type.ts`
  - `uploadClientLogoAction(prev: ActionResult<{ url: string }> | null, formData: FormData): Promise<ActionResult<{ url: string }>>` (fields `clientId`, `file`)
  - `removeClientLogoAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult>` (field `clientId`)

- [ ] **Step 1: Failing tests.** `tests/image-type.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectImageType } from "@/lib/image-type";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("detectImageType", () => {
  it("detects PNG", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe("image/png");
  });
  it("detects JPEG", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe("image/jpeg");
  });
  it("detects WebP", () => {
    // "RIFF" size "WEBP"
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });
  it("rejects SVG/text and short input", () => {
    expect(detectImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectImageType(bytes(0x89, 0x50))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
  it("rejects RIFF that is not WebP", () => {
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
});
```

`tests/admin-logo-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/superadmin", () => ({ requireSuperadmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  removeClientLogoAction,
  uploadClientLogoAction,
} from "@/app/dashboard/(protected)/admin/actions";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_BASE = "https://proj.supabase.co/storage/v1/object/public/client-logos/";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function formWith(file: File | string | null, clientId = CLIENT_ID) {
  const f = new FormData();
  f.set("clientId", clientId);
  if (file !== null) f.set("file", file);
  return f;
}

function fakeAdmin(cfg: { currentLogo?: string | null; clientMissing?: boolean; updateError?: boolean; uploadError?: boolean } = {}) {
  const events: string[] = [];
  const uploads: { path: string; contentType: string }[] = [];
  const updates: unknown[] = [];

  const storageApi = {
    upload: vi.fn(async (path: string, _body: unknown, opts: { contentType: string }) => {
      events.push(`upload:${path}`);
      uploads.push({ path, contentType: opts.contentType });
      return cfg.uploadError ? { data: null, error: { message: "x" } } : { data: { path }, error: null };
    }),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `${PUBLIC_BASE}${path}` } })),
    remove: vi.fn(async (paths: string[]) => {
      for (const p of paths) events.push(`remove:${p}`);
      return { data: [], error: null };
    }),
  };

  const from = (table: string) => {
    let op = "select";
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      update: (payload: unknown) => {
        op = "update";
        updates.push(payload);
        return builder;
      },
      maybeSingle: async () => ({
        data: table === "clients" && !cfg.clientMissing ? { logo_url: cfg.currentLogo ?? null } : null,
        error: null,
      }),
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ error: op === "update" && cfg.updateError ? { message: "db" } : null }),
    };
    return builder;
  };

  vi.mocked(createAdminClient).mockReturnValue({
    from,
    storage: { from: () => storageApi },
  } as unknown as ReturnType<typeof createAdminClient>);
  return { events, uploads, updates, storageApi };
}

describe("uploadClientLogoAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperadmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireSuperadmin>>);
  });

  it("rejects non-superadmins before touching storage", async () => {
    vi.mocked(requireSuperadmin).mockRejectedValue(new Error("Forbidden"));
    await expect(
      uploadClientLogoAction(null, formWith(new File([PNG], "a.png", { type: "image/png" })))
    ).rejects.toThrow("Forbidden");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("requires a file", async () => {
    fakeAdmin();
    expect(await uploadClientLogoAction(null, formWith(null))).toEqual({ ok: false, error: "Choose an image to upload." });
    expect(await uploadClientLogoAction(null, formWith("not a file"))).toEqual({ ok: false, error: "Choose an image to upload." });
  });

  it("rejects files over 2 MB", async () => {
    const admin = fakeAdmin();
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    const result = await uploadClientLogoAction(null, formWith(new File([big], "big.png", { type: "image/png" })));
    expect(result).toEqual({ ok: false, error: "The image must be 2 MB or smaller." });
    expect(admin.storageApi.upload).not.toHaveBeenCalled();
  });

  it("rejects non-images even when the browser says image/png", async () => {
    const admin = fakeAdmin();
    const fake = new File([new TextEncoder().encode("<svg></svg>")], "x.png", { type: "image/png" });
    const result = await uploadClientLogoAction(null, formWith(fake));
    expect(result).toEqual({ ok: false, error: "Upload a PNG, JPG or WebP image." });
    expect(admin.storageApi.upload).not.toHaveBeenCalled();
  });

  it("reports an unknown client without uploading", async () => {
    const admin = fakeAdmin({ clientMissing: true });
    const result = await uploadClientLogoAction(null, formWith(new File([PNG], "a.png", { type: "image/png" })));
    expect(result).toEqual({ ok: false, error: "Client not found." });
    expect(admin.storageApi.upload).not.toHaveBeenCalled();
  });

  it("uploads under the client folder, stores the public url and removes the previous logo afterwards", async () => {
    const admin = fakeAdmin({ currentLogo: `${PUBLIC_BASE}${CLIENT_ID}/old.png` });
    const result = await uploadClientLogoAction(null, formWith(new File([PNG], "a.png", { type: "image/png" })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(admin.uploads).toHaveLength(1);
    expect(admin.uploads[0].path.startsWith(`${CLIENT_ID}/`)).toBe(true);
    expect(admin.uploads[0].path.endsWith(".png")).toBe(true);
    expect(admin.uploads[0].contentType).toBe("image/png");
    expect(result.data.url).toBe(`${PUBLIC_BASE}${admin.uploads[0].path}`);
    expect(admin.updates).toEqual([{ logo_url: result.data.url }]);
    expect(admin.events).toEqual([`upload:${admin.uploads[0].path}`, `remove:${CLIENT_ID}/old.png`]);
  });

  it("removes the new object when the database update fails", async () => {
    const admin = fakeAdmin({ updateError: true });
    const result = await uploadClientLogoAction(null, formWith(new File([PNG], "a.png", { type: "image/png" })));
    expect(result.ok).toBe(false);
    expect(admin.events).toEqual([`upload:${admin.uploads[0].path}`, `remove:${admin.uploads[0].path}`]);
  });

  it("fails cleanly when the upload itself fails", async () => {
    const admin = fakeAdmin({ uploadError: true });
    const result = await uploadClientLogoAction(null, formWith(new File([PNG], "a.png", { type: "image/png" })));
    expect(result).toEqual({ ok: false, error: "Could not upload the logo." });
    expect(admin.updates).toEqual([]);
  });
});

describe("removeClientLogoAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperadmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireSuperadmin>>);
  });

  it("rejects non-superadmins before touching storage", async () => {
    vi.mocked(requireSuperadmin).mockRejectedValue(new Error("Forbidden"));
    await expect(removeClientLogoAction(null, formWith(null))).rejects.toThrow("Forbidden");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("clears the url and deletes the stored object", async () => {
    const admin = fakeAdmin({ currentLogo: `${PUBLIC_BASE}${CLIENT_ID}/logo.png` });
    expect(await removeClientLogoAction(null, formWith(null))).toEqual({ ok: true, data: null });
    expect(admin.updates).toEqual([{ logo_url: null }]);
    expect(admin.events).toEqual([`remove:${CLIENT_ID}/logo.png`]);
  });

  it("is a no-op success when there is no logo", async () => {
    const admin = fakeAdmin({ currentLogo: null });
    expect(await removeClientLogoAction(null, formWith(null))).toEqual({ ok: true, data: null });
    expect(admin.events).toEqual([]);
  });
});
```

Run `npx vitest run tests/image-type.test.ts tests/admin-logo-actions.test.ts` → expect FAIL (missing modules/exports).

- [ ] **Step 2: `lib/image-type.ts`**

```ts
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const LOGO_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type LogoMime = keyof typeof LOGO_EXTENSIONS;

// The browser-reported File.type is attacker-controlled; trust the magic bytes.
export function detectImageType(bytes: Uint8Array): LogoMime | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}
```

- [ ] **Step 3: Actions.** In `admin/actions.ts` add `import { LOGO_EXTENSIONS, LOGO_MAX_BYTES, detectImageType } from "@/lib/image-type";` and `import { z } from "zod";` (if not already imported), and append:

```ts
const LOGO_BUCKET = "client-logos";

// Public URLs look like <base>/storage/v1/object/public/client-logos/<path>.
function logoPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${LOGO_BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}

export async function uploadClientLogoAction(
  _prev: ActionResult<{ url: string }> | null,
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  await requireSuperadmin();
  const clientId = formData.get("clientId");
  if (!z.uuid().safeParse(clientId).success) return fail("Invalid client.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose an image to upload.");
  if (file.size > LOGO_MAX_BYTES) return fail("The image must be 2 MB or smaller.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageType(bytes);
  if (!mime) return fail("Upload a PNG, JPG or WebP image.");

  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("logo_url").eq("id", clientId as string).maybeSingle();
  if (!client) return fail("Client not found.");

  const path = `${clientId}/${Date.now()}.${LOGO_EXTENSIONS[mime]}`;
  const storage = admin.storage.from(LOGO_BUCKET);
  const { error: uploadError } = await storage.upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadError) return fail("Could not upload the logo.");

  const url = storage.getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await admin.from("clients").update({ logo_url: url }).eq("id", clientId as string);
  if (updateError) {
    await storage.remove([path]); // do not leave an orphaned object
    return fail("Could not save the logo.");
  }

  const previous = logoPathFromUrl(client.logo_url);
  if (previous && previous !== path) await storage.remove([previous]);

  revalidatePath(`${ADMIN_PATH}/clients/${clientId}`, "layout");
  return { ok: true, data: { url } };
}

export async function removeClientLogoAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const clientId = formData.get("clientId");
  if (!z.uuid().safeParse(clientId).success) return fail("Invalid client.");

  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("logo_url").eq("id", clientId as string).maybeSingle();
  if (!client) return fail("Client not found.");
  if (!client.logo_url) return { ok: true, data: null };

  const { error } = await admin.from("clients").update({ logo_url: null }).eq("id", clientId as string);
  if (error) return fail("Could not remove the logo.");

  const path = logoPathFromUrl(client.logo_url);
  if (path) await admin.storage.from(LOGO_BUCKET).remove([path]);

  revalidatePath(`${ADMIN_PATH}/clients/${clientId}`, "layout");
  return { ok: true, data: null };
}
```

NOTE for the implementer: in the test `removeClientLogoAction(null, formWith(null))` the `clientId` is valid but the earlier "rejects non-superadmins" case must pass because `requireSuperadmin()` throws first. In the "unknown client" test the fake's `maybeSingle` returns `null` data. Keep the exact error strings used by the tests.

- [ ] **Step 4: Run** `npx vitest run tests/image-type.test.ts tests/admin-logo-actions.test.ts && npx tsc --noEmit && npm test && npx eslint "app/dashboard/(protected)" lib tests`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/image-type.ts tests/image-type.test.ts tests/admin-logo-actions.test.ts "app/dashboard/(protected)/admin/actions.ts"
git commit -m "feat: superadmin actions to upload and remove a client logo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Logo card in the client Settings tab

**Files:**
- Create: `app/dashboard/(protected)/admin/clients/[clientId]/settings/logo-card.tsx`
- Modify: `app/dashboard/(protected)/admin/clients/[clientId]/settings/page.tsx`

**Interfaces:**
- Consumes: `uploadClientLogoAction`, `removeClientLogoAction` (Task 2).
- Produces: `LogoCard({ clientId, logoUrl, clientName })` client component.

- [ ] **Step 1: `logo-card.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  removeClientLogoAction,
  uploadClientLogoAction,
} from "@/app/dashboard/(protected)/admin/actions";

export function LogoCard({
  clientId,
  logoUrl,
  clientName,
}: {
  clientId: string;
  logoUrl: string | null;
  clientName: string;
}) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadClientLogoAction, null);
  const [removeState, removeAction, removing] = useActionState(removeClientLogoAction, null);
  const shownUrl = uploadState?.ok ? uploadState.data.url : removeState?.ok ? null : logoUrl;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shownUrl} alt={`${clientName} logo`} className="max-h-16 w-auto object-contain" />
        ) : (
          <p className="text-sm text-body">No logo yet. The survey page will show only the names.</p>
        )}
      </div>

      <form action={uploadAction} className="flex gap-3 flex-wrap items-end">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logo-file">Logo (PNG, JPG or WebP, up to 2 MB)</Label>
          <Input id="logo-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
        </div>
        <Button type="submit" disabled={uploading}>Upload</Button>
      </form>
      {uploadState && !uploadState.ok && <p role="alert" className="text-sm text-red-600">{uploadState.error}</p>}
      {uploadState?.ok && <p role="status" className="text-sm text-body">Logo updated.</p>}

      {shownUrl && (
        <form action={removeAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <Button type="submit" variant="outline" size="sm" disabled={removing}>Remove logo</Button>
        </form>
      )}
      {removeState && !removeState.ok && <p role="alert" className="text-sm text-red-600">{removeState.error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Settings page.** In `settings/page.tsx` select `logo_url` too: `.select("id, name, slug, logo_url")`; import `LogoCard` from `"./logo-card"`; add, between the "Client details" card and the "Delete client" card:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent>
          <LogoCard clientId={client.id} logoUrl={client.logo_url} clientName={client.name} />
        </CardContent>
      </Card>
```

- [ ] **Step 3: Verify:** `npx tsc --noEmit && npm test && npx eslint "app/dashboard/(protected)" lib tests && npx next build --webpack`. Expected clean (build may be skipped if env prevents it; report honestly).

- [ ] **Step 4: Commit**

```bash
git add -A "app/dashboard/(protected)/admin/clients"
git commit -m "feat: client logo upload card in the agency Settings tab

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
