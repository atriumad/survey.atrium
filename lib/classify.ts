import type { Classification } from "@/lib/types";

interface ClassifyInput {
  rating: number;
  comment: string;
  negativeKeywords: string[];
}

interface ClassifyResult {
  classification: Classification;
  matchedKeywords: string[];
}

export function classifyReview({ rating, comment, negativeKeywords }: ClassifyInput): ClassifyResult {
  const commentLower = comment.toLowerCase();
  const matchedKeywords = negativeKeywords.filter((keyword) =>
    commentLower.includes(keyword.toLowerCase())
  );

  const classification: Classification =
    rating >= 4 && matchedKeywords.length === 0 ? "good" : "bad";

  return { classification, matchedKeywords };
}
