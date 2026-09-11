import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRateLimitKey,
  consumeRateLimit,
  getRequestIp,
  LOGIN_POLICY,
  SUBMIT_REVIEW_POLICY,
} from "@/lib/rate-limit";

function fakeSupabase(result: { data?: boolean; error?: { message: string } }) {
  const rpc = vi.fn(async () => result);
  return { rpc } as unknown as Pick<SupabaseClient, "rpc">;
}

describe("getRequestIp", () => {
  it("uses the first x-forwarded-for value", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });
    expect(getRequestIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.9" });
    expect(getRequestIp(headers)).toBe("198.51.100.9");
  });

  it("returns unknown when no header is present", () => {
    expect(getRequestIp(new Headers())).toBe("unknown");
  });
});

describe("buildRateLimitKey", () => {
  it("combines action and ip", () => {
    expect(buildRateLimitKey("203.0.113.7", "submit-review")).toBe(
      "submit-review:203.0.113.7"
    );
    expect(buildRateLimitKey("10.0.0.1", "login")).toBe("login:10.0.0.1");
  });
});

describe("policies", () => {
  it("allows 2 review submissions per minute", () => {
    expect(SUBMIT_REVIEW_POLICY).toEqual({ maxAttempts: 2, windowSeconds: 60 });
  });

  it("allows 5 login attempts per minute", () => {
    expect(LOGIN_POLICY).toEqual({ maxAttempts: 5, windowSeconds: 60 });
  });
});

describe("consumeRateLimit", () => {
  it("returns true when the RPC permits the request", async () => {
    const supabase = fakeSupabase({ data: true });
    await expect(
      consumeRateLimit(supabase, "submit-review:203.0.113.7", SUBMIT_REVIEW_POLICY)
    ).resolves.toBe(true);
  });

  it("returns false when the RPC blocks the request", async () => {
    const supabase = fakeSupabase({ data: false });
    await expect(
      consumeRateLimit(supabase, "submit-review:203.0.113.7", SUBMIT_REVIEW_POLICY)
    ).resolves.toBe(false);
  });

  it("passes the key, window, and max attempts as rpc args", async () => {
    const supabase = fakeSupabase({ data: true });
    await consumeRateLimit(supabase, "login:10.0.0.1", LOGIN_POLICY);
    expect(supabase.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_key: "login:10.0.0.1",
      p_window_seconds: 60,
      p_max_attempts: 5,
    });
  });

  it("fails open when the RPC errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = fakeSupabase({ error: { message: "boom" } });
    await expect(
      consumeRateLimit(supabase, "submit-review:203.0.113.7", SUBMIT_REVIEW_POLICY)
    ).resolves.toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});