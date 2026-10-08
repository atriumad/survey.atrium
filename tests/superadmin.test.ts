import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/get-profile", () => ({ getProfile: vi.fn() }));

import { getProfile } from "@/lib/get-profile";
import { requireSuperadmin } from "@/lib/superadmin";

describe("requireSuperadmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects anonymous callers", async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    await expect(requireSuperadmin()).rejects.toThrow("Forbidden");
  });

  it("rejects client admins", async () => {
    vi.mocked(getProfile).mockResolvedValue({ role: "admin", clientId: "c1", locationId: null });
    await expect(requireSuperadmin()).rejects.toThrow("Forbidden");
  });

  it("rejects managers", async () => {
    vi.mocked(getProfile).mockResolvedValue({ role: "manager", clientId: "c1", locationId: "l1" });
    await expect(requireSuperadmin()).rejects.toThrow("Forbidden");
  });

  it("accepts a superadmin", async () => {
    const profile = { role: "superadmin" as const, clientId: null, locationId: null };
    vi.mocked(getProfile).mockResolvedValue(profile);
    await expect(requireSuperadmin()).resolves.toEqual(profile);
  });
});
