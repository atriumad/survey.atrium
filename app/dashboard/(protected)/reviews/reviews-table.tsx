"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reviewsToCsv } from "@/lib/csv";
import type { Review } from "@/lib/types";

export function ReviewsTable({ reviews }: { reviews: Review[] }) {
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
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleExport} disabled={reviews.length === 0}>
          Exportar CSV
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Fecha</th>
            <th className="p-2">Rating</th>
            <th className="p-2">Clasificacion</th>
            <th className="p-2">Comentario</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.id} className="border-b">
              <td className="p-2">{review.created_at.slice(0, 10)}</td>
              <td className="p-2">{review.rating}★</td>
              <td className="p-2">
                <Badge variant={review.classification === "good" ? "default" : "destructive"}>
                  {review.classification}
                </Badge>
              </td>
              <td className="p-2">{review.comment ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {reviews.length === 0 && <p className="text-muted-foreground text-center py-8">Sin reviews todavia.</p>}
    </div>
  );
}