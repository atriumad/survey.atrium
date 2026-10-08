import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/superadmin", () => ({ requireSuperadmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createClientAction,
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
} from "@/app/dashboard/(protected)/admin/actions";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function fd(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

type Chain = { eq: () => Chain; maybeSingle: () => Promise<{ data: unknown }> };
type DbError = { code: string; message: string } | null;

function fakeAdmin(opts: { location?: { id: string } | null; targetRole?: string | null; profileError?: DbError; clientError?: DbError } = {}) {
  const createUser = vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null }));
  const deleteUser = vi.fn(async () => ({ error: null }));
  const updateUserById = vi.fn(async () => ({ error: null }));
  const inserts: Record<string, unknown[]> = {};

  const from = vi.fn((table: string) => ({
    insert: vi.fn(async (row: unknown) => {
      (inserts[table] ??= []).push(row);
      const error = table === "profiles" ? opts.profileError : table === "clients" ? opts.clientError : null;
      return { error: error ?? null };
    }),
    select: vi.fn(() => {
      const data =
        table === "locations" ? (opts.location ?? null) : table === "profiles" && opts.targetRole ? { role: opts.targetRole } : null;
      const chain: Chain = { eq: () => chain, maybeSingle: async () => ({ data }) };
      return chain;
    }),
  }));

  const client = { from, auth: { admin: { createUser, deleteUser, updateUserById } } };
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
  return { createUser, deleteUser, updateUserById, inserts };
}

describe("superadmin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperadmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireSuperadmin>>);
  });

  it("refuses non-superadmins before touching the database", async () => {
    vi.mocked(requireSuperadmin).mockRejectedValue(new Error("Forbidden"));
    await expect(
      createUserAction(null, fd({ clientId: CLIENT_ID, email: "a@b.com", role: "admin", locationId: "" }))
    ).rejects.toThrow("Forbidden");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("creates an admin user and returns the generated password once", async () => {
    const admin = fakeAdmin();
    const result = await createUserAction(
      null,
      fd({ clientId: CLIENT_ID, email: "Owner@Client.com", role: "admin", locationId: "" })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.email).toBe("owner@client.com");
    expect(result.data.password).toHaveLength(16);
    expect(admin.createUser).toHaveBeenCalledWith({
      email: "owner@client.com",
      password: result.data.password,
      email_confirm: true,
    });
    expect(admin.inserts.profiles).toEqual([
      { id: USER_ID, client_id: CLIENT_ID, role: "admin", location_id: null },
    ]);
  });

  it("rejects a manager whose location belongs to another client, creating nothing", async () => {
    const admin = fakeAdmin({ location: null });
    const result = await createUserAction(
      null,
      fd({ clientId: CLIENT_ID, email: "m@client.com", role: "manager", locationId: LOCATION_ID })
    );
    expect(result).toEqual({ ok: false, error: "Location does not belong to this client." });
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it("deletes the auth user when the profile insert fails", async () => {
    const admin = fakeAdmin({ profileError: { code: "23503", message: "fk" } });
    const result = await createUserAction(
      null,
      fd({ clientId: CLIENT_ID, email: "a@b.com", role: "admin", locationId: "" })
    );
    expect(result.ok).toBe(false);
    expect(admin.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("maps a duplicate client slug to a readable message", async () => {
    fakeAdmin({ clientError: { code: "23505", message: 'duplicate key "clients_slug_key"' } });
    const result = await createClientAction(null, fd({ name: "Don Chuys", slug: "don-chuys" }));
    expect(result).toEqual({ ok: false, error: "That slug is already in use. Choose a different one." });
  });

  it("refuses to reset a superadmin password", async () => {
    const admin = fakeAdmin({ targetRole: "superadmin" });
    const result = await resetPasswordAction(null, fd({ userId: USER_ID }));
    expect(result).toEqual({ ok: false, error: "User not found." });
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it("resets a tenant user's password", async () => {
    const admin = fakeAdmin({ targetRole: "admin" });
    const result = await resetPasswordAction(null, fd({ userId: USER_ID }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(admin.updateUserById).toHaveBeenCalledWith(USER_ID, { password: result.data.password });
  });

  it("refuses to delete a superadmin", async () => {
    const admin = fakeAdmin({ targetRole: "superadmin" });
    await expect(deleteUserAction(fd({ userId: USER_ID }))).rejects.toThrow("User not found.");
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
});
