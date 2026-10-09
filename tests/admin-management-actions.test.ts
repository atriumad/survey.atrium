import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/superadmin", () => ({ requireSuperadmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteClientAction,
  updateClientAction,
  updateLocationAction,
} from "@/app/dashboard/(protected)/admin/actions";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const USER_A = "33333333-3333-4333-8333-333333333333";
const USER_B = "44444444-4444-4444-8444-444444444444";

function fd(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

type DbError = { code: string; message: string } | null;

function fakeAdmin(
  cfg: {
    clientSlug?: string | null;
    profileIds?: string[];
    deleteUserFailsFor?: string;
    clientDeleteError?: DbError;
    clientUpdateError?: DbError;
    locationClientId?: string | null;
    locationUpdateError?: DbError;
  } = {}
) {
  const events: string[] = [];
  const updates: { table: string; payload: unknown }[] = [];

  const from = (table: string) => {
    let op = "select";
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      delete: () => {
        op = "delete";
        return builder;
      },
      update: (payload: unknown) => {
        op = "update";
        updates.push({ table, payload });
        return builder;
      },
      maybeSingle: async () => {
        if (table === "clients") {
          return { data: cfg.clientSlug === null ? null : { slug: cfg.clientSlug ?? "acme" }, error: null };
        }
        if (table === "locations") {
          return {
            data: cfg.locationClientId === null ? null : { client_id: cfg.locationClientId ?? CLIENT_ID },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === "profiles" && op === "select") {
          return resolve({ data: (cfg.profileIds ?? []).map((id) => ({ id })), error: null });
        }
        if (table === "clients" && op === "delete") {
          events.push("delete:client");
          return resolve({ error: cfg.clientDeleteError ?? null });
        }
        if (table === "clients" && op === "update") return resolve({ error: cfg.clientUpdateError ?? null });
        if (table === "locations" && op === "update") return resolve({ error: cfg.locationUpdateError ?? null });
        return resolve({ data: [], error: null });
      },
    };
    return builder;
  };

  const deleteUser = vi.fn(async (id: string) => {
    events.push(`deleteUser:${id}`);
    return { error: cfg.deleteUserFailsFor === id ? { message: "boom" } : null };
  });

  vi.mocked(createAdminClient).mockReturnValue({
    from,
    auth: { admin: { deleteUser } },
  } as unknown as ReturnType<typeof createAdminClient>);
  return { events, updates, deleteUser };
}

describe("agency management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperadmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireSuperadmin>>);
  });

  it("rejects non-superadmins before creating the admin client", async () => {
    vi.mocked(requireSuperadmin).mockRejectedValue(new Error("Forbidden"));
    await expect(updateClientAction(null, fd({ clientId: CLIENT_ID, name: "A", slug: "a" }))).rejects.toThrow("Forbidden");
    await expect(updateLocationAction(null, fd({ locationId: LOCATION_ID, name: "A" }))).rejects.toThrow("Forbidden");
    await expect(deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "acme" }))).rejects.toThrow("Forbidden");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("renames a client and maps a duplicate slug to a readable message", async () => {
    const ok = fakeAdmin();
    expect(await updateClientAction(null, fd({ clientId: CLIENT_ID, name: "Acme 2", slug: "Acme-2" }))).toEqual({
      ok: true,
      data: null,
    });
    expect(ok.updates).toEqual([{ table: "clients", payload: { name: "Acme 2", slug: "acme-2" } }]);

    fakeAdmin({ clientUpdateError: { code: "23505", message: 'duplicate key "clients_slug_key"' } });
    expect(await updateClientAction(null, fd({ clientId: CLIENT_ID, name: "Acme 2", slug: "taken" }))).toEqual({
      ok: false,
      error: "That slug is already in use. Choose a different one.",
    });
  });

  it("updates a location's name and review link but never its slug", async () => {
    const admin = fakeAdmin();
    const result = await updateLocationAction(
      null,
      fd({ locationId: LOCATION_ID, name: "Centro", googleReviewUrl: "https://g.page/r/X/review", slug: "hacked" })
    );
    expect(result).toEqual({ ok: true, data: null });
    expect(admin.updates).toEqual([
      { table: "locations", payload: { name: "Centro", google_review_url: "https://g.page/r/X/review" } },
    ]);
  });

  it("fails cleanly for an unknown location", async () => {
    const admin = fakeAdmin({ locationClientId: null });
    const result = await updateLocationAction(null, fd({ locationId: LOCATION_ID, name: "Centro" }));
    expect(result).toEqual({ ok: false, error: "Location not found." });
    expect(admin.updates).toEqual([]);
  });

  it("refuses to delete a client when the confirmation slug is wrong", async () => {
    const admin = fakeAdmin({ clientSlug: "acme", profileIds: [USER_A] });
    const result = await deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "nope" }));
    expect(result).toEqual({ ok: false, error: "Type the client slug exactly to confirm." });
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(admin.events).toEqual([]);
  });

  it("deletes the client's users before the client, then redirects", async () => {
    const admin = fakeAdmin({ clientSlug: "acme", profileIds: [USER_A, USER_B] });
    await expect(deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "ACME" }))).rejects.toThrow(
      "REDIRECT:/dashboard/admin/clients"
    );
    expect(admin.events).toEqual([`deleteUser:${USER_A}`, `deleteUser:${USER_B}`, "delete:client"]);
  });

  it("does not delete the client if a user deletion fails", async () => {
    const admin = fakeAdmin({ clientSlug: "acme", profileIds: [USER_A, USER_B], deleteUserFailsFor: USER_B });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "acme" }));
    expect(result.ok).toBe(false);
    expect(admin.events).not.toContain("delete:client");
  });

  it("reports an unknown client", async () => {
    fakeAdmin({ clientSlug: null });
    expect(await deleteClientAction(null, fd({ clientId: CLIENT_ID, confirmSlug: "acme" }))).toEqual({
      ok: false,
      error: "Client not found.",
    });
  });
});
