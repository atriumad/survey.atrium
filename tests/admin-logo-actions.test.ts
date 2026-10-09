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
