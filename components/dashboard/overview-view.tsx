import { Card, CardContent } from "@/components/ui/card";
import { RatingEmoji } from "@/components/ui/rating-emoji";
import { ReviewsTable } from "@/app/dashboard/(protected)/reviews/reviews-table";
import type { OverviewData } from "@/lib/dashboard-data";
import { cn } from "cn";

export function OverviewView({ data }: { data: OverviewData }) {
  const { summary, scansTotal, conversionRate, ratingTier, trend, recentReviews } = data;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <AverageRatingCard
          average={summary.averageRating}
          total={summary.total}
          tier={ratingTier}
          trend={trend}
        />
        <MetricCard label="Total reviews" value={summary.total} />
        <MetricCard label="% Good" value={`${summary.goodPercent}%`} />
        <MetricCard label="% Clicked Google review" value={`${summary.sharedPercent}%`} />
        <MetricCard label="QR Scans" value={scansTotal} />
        <MetricCard
          label="Conversion"
          value={conversionRate === null ? "—" : `${conversionRate}%`}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Rating distribution</h2>
        <div className="rounded-[26px] bg-white border border-cool p-5 flex flex-col gap-3">
          {([5, 4, 3, 2, 1] as const).map((level) => {
            const count = summary.starDistribution[level];
            const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
            return (
              <div key={level} className="flex items-center gap-3">
                <span className="w-8 shrink-0">
                  <RatingEmoji rating={level} size="sm" />
                </span>
                <div className="flex-1 h-3 rounded-full bg-cool overflow-hidden">
                  <div
                    className={`h-full rounded-full ${level <= 3 ? "bg-amber" : "bg-green-fill"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-24 text-right text-sm text-body shrink-0">
                  {count} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Last 24 hours</h2>
        <ReviewsTable reviews={recentReviews} />
      </div>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card size="sm" className="p-4">
      <CardContent className="p-0 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-body">{label}</p>
        <p className="text-3xl font-semibold text-ink">{value}</p>
      </CardContent>
    </Card>
  );
}

function AverageRatingCard({
  average,
  total,
  tier,
  trend,
}: {
  average: number;
  total: number;
  tier: string;
  trend: { direction: "up" | "down" | "flat"; delta: number } | null;
}) {
  return (
    <Card size="sm" className="p-4">
      <CardContent className="p-0 flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-body">Average rating</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-3xl font-semibold text-ink">{total > 0 ? average.toFixed(1) : "—"}</p>
          <em className="font-serif italic text-body text-base not-italic:font-serif">{tier}</em>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {total > 0 && <RatingEmoji rating={average} size="sm" />}
          {trend && (
            <span
              className={cn(
                "text-xs font-medium",
                trend.direction === "up" && "text-green",
                trend.direction === "down" && "text-amber-fill",
                trend.direction === "flat" && "text-body"
              )}
            >
              {trend.direction === "up" && "▲"}
              {trend.direction === "down" && "▼"}
              {trend.direction === "flat" && "→"}{" "}
              {trend.delta > 0 ? "+" : ""}
              {trend.delta.toFixed(1)} vs prior 30d
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
