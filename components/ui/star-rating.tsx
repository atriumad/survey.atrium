import { cn } from "cn";

export function StarRating({
  rating,
  size = "default",
  mutedClassName = "text-ink/15",
}: {
  rating: number;
  size?: "sm" | "default" | "lg";
  mutedClassName?: string;
}) {
  const filled = Math.round(rating);
  const sizeClass = size === "sm" ? "text-sm" : size === "lg" ? "text-3xl" : "text-base";

  return (
    <span className={cn("inline-flex", sizeClass)} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= filled ? "text-amber" : mutedClassName}>
          ★
        </span>
      ))}
    </span>
  );
}
