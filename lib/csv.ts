import type { Review } from "@/lib/types";

function escapeCsvField(value: string): string {
  if (value.includes(" ") || value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function reviewsToCsv(reviews: Review[]): string {
  const header = "date,rating,classification,comment,keywords\n";
  const rows = reviews.map((review) => {
    const date = review.created_at.slice(0, 10);
    const comment = escapeCsvField(review.comment ?? "");
    const keywords = (review.matched_keywords ?? []).join(";");
    return `${date},${review.rating},${review.classification},${comment},${keywords}`;
  });
  return header + rows.map((row) => `${row}\n`).join("");
}