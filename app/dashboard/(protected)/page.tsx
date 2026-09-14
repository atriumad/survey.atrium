import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import {
  summarizeReviews,
  calculateConversionRate,
  describeAverageRating,
  describeRatingTrend,
} from "@/lib/metrics";
import { LocationFilter } from "./location-filter";
import { PageHeader } from "./page-header";
import { ReviewsTable } from "./reviews/reviews-table";
import { RatingEmoji } from "@/components/ui/rating-emoji";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "cn";
import type { Review, ReviewWithLocation } from "@/lib/types";

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("client_id", profile.clientId);

  let query = supabase.from("reviews").select("*").eq("client_id", profile.clientId);
  const effectiveLocation = profile.role === "manager" ? profile.locationId : location;
  if (effectiveLocation) query = query.eq("location_id", effectiveLocation);

  const { data: reviews } = await query;
  const summary = summarizeReviews((reviews ?? []) as Review[]);

  let scansQuery = supabase
    .from("qr_scans")
    .select("*", { count: "exact", head: true })
    .eq("client_id", profile.clientId);
  if (effectiveLocation) scansQuery = scansQuery.eq("location_id", effectiveLocation);
  const { count: scansTotal } = await scansQuery;
  const conversionRate = calculateConversionRate(summary.total, scansTotal ?? 0);
  const ratingTier = describeAverageRating(summary.averageRating, summary.total);

  const thirtyDaysAgo = daysAgoIso(30);
  const sixtyDaysAgo = daysAgoIso(60);

  let currentPeriodQuery = supabase
    .from("reviews")
    .select("rating")
    .eq("client_id", profile.clientId)
    .gte("created_at", thirtyDaysAgo);
  if (effectiveLocation) currentPeriodQuery = currentPeriodQuery.eq("location_id", effectiveLocation);

  let previousPeriodQuery = supabase
    .from("reviews")
    .select("rating")
    .eq("client_id", profile.clientId)
    .gte("created_at", sixtyDaysAgo)
    .lt("created_at", thirtyDaysAgo);
  if (effectiveLocation) previousPeriodQuery = previousPeriodQuery.eq("location_id", effectiveLocation);

  const [{ data: currentPeriodReviews }, { data: previousPeriodReviews }] = await Promise.all([
    currentPeriodQuery,
    previousPeriodQuery,
  ]);

  const currentPeriodAvg =
    currentPeriodReviews && currentPeriodReviews.length > 0
      ? currentPeriodReviews.reduce((sum, r) => sum + r.rating, 0) / currentPeriodReviews.length
      : 0;
  const previousPeriodAvg =
    previousPeriodReviews && previousPeriodReviews.length > 0
      ? previousPeriodReviews.reduce((sum, r) => sum + r.rating, 0) / previousPeriodReviews.length
      : 0;
  const trend = describeRatingTrend(
    currentPeriodAvg,
    previousPeriodAvg,
    previousPeriodReviews?.length ?? 0
  );

  const twentyFourHoursAgo = daysAgoIso(1);
  let recentQuery = supabase
    .from("reviews")
    .select("*, location:locations(name)")
    .eq("client_id", profile.clientId)
    .gte("created_at", twentyFourHoursAgo)
    .order("created_at", { ascending: false });
  if (effectiveLocation) recentQuery = recentQuery.eq("location_id", effectiveLocation);
  const { data: recentReviews } = await recentQuery;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        actions={profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <AverageRatingCard
          average={summary.averageRating}
          total={summary.total}
          tier={ratingTier}
          trend={trend}
        />
        <MetricCard label="Total reviews" value={summary.total} />
        <MetricCard label="% Good" value={`${summary.goodPercent}%`} />
        <MetricCard label="% Shared to Google" value={`${summary.sharedPercent}%`} />
        <MetricCard label="QR Scans" value={scansTotal ?? 0} />
        <MetricCard
          label="Conversion"
          value={conversionRate === null ? "—" : `${conversionRate}%`}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Star distribution</h2>
        <div className="rounded-[26px] bg-white border border-cool p-5 flex flex-col gap-3">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const count = summary.starDistribution[star];
            const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-3">
                <span className="w-8 text-sm font-medium text-ink shrink-0">{star}★</span>
                <div className="flex-1 h-3 rounded-full bg-cool overflow-hidden">
                  <div
                    className={`h-full rounded-full ${star <= 3 ? "bg-amber" : "bg-green-fill"}`}
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
        <ReviewsTable reviews={(recentReviews ?? []) as ReviewWithLocation[]} />
      </div>
    </div>
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
