"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { reviewsToCsv } from "@/lib/csv";
import type { Review, ReviewWithLocation } from "@/lib/types";

export function ExportButton({ reviews }: { reviews: Review[] }) {
  function handleExport() {
    const csv = reviewsToCsv(reviews);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reviews-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={reviews.length === 0}>
      Export CSV
    </Button>
  );
}

const COLUMN_COUNT = 6;

export function ReviewsTable({
  reviews,
  fillTo,
}: {
  reviews: ReviewWithLocation[];
  fillTo?: number;
}) {
  const fillerCount = fillTo && fillTo > reviews.length ? fillTo - reviews.length : 0;

  return (
    <div className="rounded-[26px] bg-white overflow-hidden shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cool text-left text-xs uppercase tracking-wide text-body">
            <th className="p-3 font-medium">Email</th>
            <th className="p-3 font-medium">Rating</th>
            <th className="p-3 font-medium">Classification</th>
            <th className="p-3 font-medium">Comment</th>
            <th className="p-3 font-medium">Date</th>
            <th className="p-3 font-medium">Location</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.id} className="border-b border-cool last:border-0">
              <td className="p-3 text-body">{review.email ?? "—"}</td>
              <td className="p-3">
                <StarRating rating={review.rating} size="sm" />
              </td>
              <td className="p-3">
                <Badge variant={review.classification === "good" ? "mint" : "destructive"}>
                  {review.classification}
                </Badge>
              </td>
              <td className="p-3 text-body">{review.comment ?? "—"}</td>
              <td className="p-3 text-body">{review.created_at.slice(0, 10)}</td>
              <td className="p-3 text-body">{review.location?.name ?? "—"}</td>
            </tr>
          ))}
          {Array.from({ length: fillerCount }).map((_, i) => (
            <tr key={`filler-${i}`} className="border-b border-cool last:border-0">
              {Array.from({ length: COLUMN_COUNT }).map((__, j) => (
                <td key={j} className="p-3 text-body/30">—</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {reviews.length === 0 && fillerCount === 0 && (
        <p className="text-body text-center py-8">No reviews yet.</p>
      )}
    </div>
  );
}
