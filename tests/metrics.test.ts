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
    email: null,
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

  it("returns null when there are no scans yet", () => {
    expect(calculateConversionRate(10, 0)).toBeNull();
  });

  it("clamps to 100 when reviews outnumber scans", () => {
    expect(calculateConversionRate(40, 1)).toBe(100);
  });
});

import { describeAverageRating } from "@/lib/metrics";

describe("describeAverageRating", () => {
  it("returns 'No data yet' when there are no reviews", () => {
    expect(describeAverageRating(0, 0)).toBe("No data yet");
  });

  it("returns 'Excellent' at 4.5 and above", () => {
    expect(describeAverageRating(4.5, 10)).toBe("Excellent");
    expect(describeAverageRating(5, 10)).toBe("Excellent");
  });

  it("returns 'Very good' between 4.0 and 4.49", () => {
    expect(describeAverageRating(4.2, 10)).toBe("Very good");
  });

  it("returns 'Average' between 3.0 and 3.99", () => {
    expect(describeAverageRating(3.1, 10)).toBe("Average");
  });

  it("returns 'Needs improvement' below 3.0", () => {
    expect(describeAverageRating(2.4, 10)).toBe("Needs improvement");
  });
});

import { describeRatingTrend } from "@/lib/metrics";

describe("describeRatingTrend", () => {
  it("returns 'up' when the current average is at least 0.1 higher", () => {
    expect(describeRatingTrend(4.5, 4.2, 10)).toEqual({ direction: "up", delta: 0.3 });
  });

  it("returns 'down' when the current average is at least 0.1 lower", () => {
    expect(describeRatingTrend(4.0, 4.5, 10)).toEqual({ direction: "down", delta: -0.5 });
  });

  it("returns 'flat' when the difference is smaller than 0.1", () => {
    expect(describeRatingTrend(4.35, 4.3, 10)).toEqual({ direction: "flat", delta: 0.05 });
  });

  it("returns null when the previous period has no reviews", () => {
    expect(describeRatingTrend(4.5, 0, 0)).toBeNull();
  });
});
