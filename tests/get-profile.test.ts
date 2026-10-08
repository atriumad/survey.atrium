import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getProfile, getTenantProfile } from "@/lib/get-profile";

function mockProfileRow(row: { client_id: string | null; role: string; location_id: string | null } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }) }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe("getProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a tenant row to camelCase", async () => {
    mockProfileRow({ client_id: "c1", role: "manager", location_id: "l1" });
    expect(await getProfile()).toEqual({ clientId: "c1", role: "manager", locationId: "l1" });
  });

  it("returns a superadmin with null client and location", async () => {
    mockProfileRow({ client_id: null, role: "superadmin", location_id: null });
    expect(await getProfile()).toEqual({ clientId: null, role: "superadmin", locationId: null });
  });

  it("returns null when there is no profile row", async () => {
    mockProfileRow(null);
    expect(await getProfile()).toBeNull();
  });
});

describe("getTenantProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects a superadmin to the admin panel", async () => {
    mockProfileRow({ client_id: null, role: "superadmin", location_id: null });
    await expect(getTenantProfile()).rejects.toThrow("REDIRECT:/dashboard/admin");
  });

  it("returns the profile for tenant users", async () => {
    mockProfileRow({ client_id: "c1", role: "admin", location_id: null });
    expect(await getTenantProfile()).toEqual({ clientId: "c1", role: "admin", locationId: null });
  });
});
