import type { Review } from "@/lib/types";

export interface ReviewSummary {
  total: number;
  averageRating: number;
  goodPercent: number;
  badPercent: number;
  sharedPercent: number;
  starDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function summarizeReviews(reviews: Review[]): ReviewSummary {
  const total = reviews.length;
  const starDistribution: ReviewSummary["starDistribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  if (total === 0) {
    return { total: 0, averageRating: 0, goodPercent: 0, badPercent: 0, sharedPercent: 0, starDistribution };
  }

  let ratingSum = 0;
  let goodCount = 0;
  let sharedCount = 0;

  for (const review of reviews) {
    ratingSum += review.rating;
    if (review.classification === "good") goodCount += 1;
    if (review.shared_to_google) sharedCount += 1;
    starDistribution[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
  }

  return {
    total,
    averageRating: Math.round((ratingSum / total) * 10) / 10,
    goodPercent: Math.round((goodCount / total) * 100),
    badPercent: Math.round(((total - goodCount) / total) * 100),
    sharedPercent: Math.round((sharedCount / total) * 100),
    starDistribution,
  };
}
