"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reviewsToCsv } from "@/lib/csv";
import type { Review } from "@/lib/types";

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

export function ReviewsTable({ reviews }: { reviews: Review[] }) {
  return (
    <div className="rounded-[26px] bg-white overflow-hidden shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cool text-left text-xs uppercase tracking-wide text-body">
            <th className="p-3 font-medium">Date</th>
            <th className="p-3 font-medium">Rating</th>
            <th className="p-3 font-medium">Classification</th>
            <th className="p-3 font-medium">Comment</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.id} className="border-b border-cool last:border-0">
              <td className="p-3 text-body">{review.created_at.slice(0, 10)}</td>
              <td className="p-3 font-medium text-ink">{review.rating}★</td>
              <td className="p-3">
                <Badge variant={review.classification === "good" ? "mint" : "destructive"}>
                  {review.classification}
                </Badge>
              </td>
              <td className="p-3 text-body">{review.comment ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {reviews.length === 0 && (
        <p className="text-body text-center py-8">No reviews yet.</p>
      )}
    </div>
  );
}
