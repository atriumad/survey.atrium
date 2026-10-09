import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.7" })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { markSharedToGoogle } from "@/app/r/[locationSlug]/actions";

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";

function fakeSupabase(opts: { allowed?: boolean; shareError?: boolean } = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    calls.push({ fn, args });
    if (fn === "consume_rate_limit") return { data: opts.allowed ?? true, error: null };
    if (fn === "mark_review_shared") return { data: null, error: opts.shareError ? { message: "x" } : null };
    return { data: null, error: null };
  });
  vi.mocked(createClient).mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof createClient>>);
  return { calls };
}

describe("markSharedToGoogle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flags the review after passing the rate limit", async () => {
    const { calls } = fakeSupabase();
    await markSharedToGoogle(REVIEW_ID);
    expect(calls.map((c) => c.fn)).toEqual(["consume_rate_limit", "mark_review_shared"]);
    expect(calls[0].args).toMatchObject({ p_key: "share-click:203.0.113.7" });
    expect(calls[1].args).toEqual({ p_review_id: REVIEW_ID });
  });

  it("ignores an invalid review id without calling the database", async () => {
    fakeSupabase();
    await markSharedToGoogle("not-a-uuid");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does nothing when rate limited", async () => {
    const { calls } = fakeSupabase({ allowed: false });
    await markSharedToGoogle(REVIEW_ID);
    expect(calls.map((c) => c.fn)).toEqual(["consume_rate_limit"]);
  });

  it("never throws when the database call fails", async () => {
    fakeSupabase({ shareError: true });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(markSharedToGoogle(REVIEW_ID)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("never throws when createClient rejects", async () => {
    vi.mocked(createClient).mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(markSharedToGoogle(REVIEW_ID)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
