// Ratings 1-3 (angry, unhappy, neutral) get a feedback field and a follow-up;
// ratings 4-5 (happy, loved it) are asked for a Google review instead.
export function needsFeedback(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 3;
}

export function isPositiveRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 4 && rating <= 5;
}
