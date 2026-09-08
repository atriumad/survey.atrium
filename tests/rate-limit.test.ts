import { describe, expect, it } from "vitest";
import { isRateLimited } from "@/lib/rate-limit";

describe("isRateLimited", () => {
  it("allows the first request from an IP", () => {
    expect(isRateLimited(`test-ip-${Date.now()}-a`)).toBe(false);
  });

  it("blocks a second request within the window", () => {
    const ip = `test-ip-${Date.now()}-b`;
    expect(isRateLimited(ip)).toBe(false);
    expect(isRateLimited(ip)).toBe(true);
  });
});