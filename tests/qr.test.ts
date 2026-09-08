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