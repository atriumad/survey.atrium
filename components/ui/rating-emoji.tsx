import { cn } from "cn";

export const RATING_EMOJI: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "😠",
  2: "🙁",
  3: "😐",
  4: "🙂",
  5: "😍",
};

export const RATING_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Angry",
  2: "Unhappy",
  3: "Neutral",
  4: "Happy",
  5: "Loved it",
};

function clampRating(rating: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, Math.round(rating))) as 1 | 2 | 3 | 4 | 5;
}

export function RatingEmoji({
  rating,
  size = "default",
}: {
  rating: number;
  size?: "sm" | "default" | "lg";
}) {
  const level = clampRating(rating);
  const sizeClass = size === "sm" ? "text-lg" : size === "lg" ? "text-4xl" : "text-2xl";

  return (
    <span className={cn("inline-block leading-none", sizeClass)} role="img" aria-label={RATING_LABEL[level]}>
      {RATING_EMOJI[level]}
    </span>
  );
}
