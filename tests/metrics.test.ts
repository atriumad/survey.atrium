import { describe, expect, it } from "vitest";
import { summarizeReviews } from "@/lib/metrics";
import type { Review } from "@/lib/types";

function makeReview(overrides: Partial<Review>): Review {
  return {
    id: "1",
    client_id: "c1",
    location_id: "l1",
    rating: 5,
    comment: null,
    classification: "good",
    matched_keywords: null,
    shared_to_google: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("summarizeReviews", () => {
  it("returns zeroed metrics for an empty list", () => {
    const result = summarizeReviews([]);
    expect(result).toEqual({
      total: 0,
      averageRating: 0,
      goodPercent: 0,
      badPercent: 0,
      sharedPercent: 0,
      starDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it("computes average rating and good/bad split", () => {
    const reviews = [
      makeReview({ rating: 5, classification: "good" }),
      makeReview({ rating: 1, classification: "bad" }),
    ];
    const result = summarizeReviews(reviews);
    expect(result.total).toBe(2);
    expect(result.averageRating).toBe(3);
    expect(result.goodPercent).toBe(50);
    expect(result.badPercent).toBe(50);
  });

  it("computes shared-to-google percent", () => {
    const reviews = [
      makeReview({ shared_to_google: true }),
      makeReview({ shared_to_google: false }),
    ];
    const result = summarizeReviews(reviews);
    expect(result.sharedPercent).toBe(50);
  });

  it("builds star distribution counts", () => {
    const reviews = [makeReview({ rating: 5 }), makeReview({ rating: 5 }), makeReview({ rating: 2 })];
    const result = summarizeReviews(reviews);
    expect(result.starDistribution).toEqual({ 1: 0, 2: 1, 3: 0, 4: 0, 5: 2 });
  });
});

import { calculateConversionRate } from "@/lib/metrics";

describe("calculateConversionRate", () => {
  it("returns the percent of scans that became reviews", () => {
    expect(calculateConversionRate(50, 200)).toBe(25);
  });

  it("returns 0 when there are no scans", () => {
    expect(calculateConversionRate(10, 0)).toBe(0);
  });
});
