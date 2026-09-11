import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { summarizeReviews, calculateConversionRate, describeAverageRating } from "@/lib/metrics";
import { LocationFilter } from "./location-filter";
import { PageHeader } from "./page-header";
import { ReviewsTable } from "./reviews/reviews-table";
import type { Review } from "@/lib/types";

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

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let recentQuery = supabase
    .from("reviews")
    .select("*")
    .eq("client_id", profile.clientId)
    .gte("created_at", twentyFourHoursAgo)
    .order("created_at", { ascending: false });
  if (effectiveLocation) recentQuery = recentQuery.eq("location_id", effectiveLocation);
  const { data: recentReviews } = await recentQuery;

  const secondaryStats: { label: string; value: string | number }[] = [
    { label: "Total reviews", value: summary.total },
    { label: "% Good", value: `${summary.goodPercent}%` },
    { label: "% Shared to Google", value: `${summary.sharedPercent}%` },
    { label: "QR Scans", value: scansTotal ?? 0 },
    { label: "Conversion", value: conversionRate === null ? "—" : `${conversionRate}%` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        actions={profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      />

      <div className="relative overflow-hidden rounded-[26px] bg-ink p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -inset-x-10 -top-20 h-64"
          style={{
            background:
              "radial-gradient(50% 60% at 70% 20%, color-mix(in srgb, var(--color-lime) 45%, transparent) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex flex-col gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-lime font-semibold">
              Average rating
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-3 text-6xl sm:text-7xl font-normal tracking-tight text-cream">
              {summary.total > 0 ? summary.averageRating.toFixed(1) : "—"}
              <em className="font-serif italic text-lime text-3xl sm:text-4xl not-italic:font-serif">
                {ratingTier}
              </em>
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-4 border-t border-line-inverse pt-6">
            {secondaryStats.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-wide text-lime/80">{stat.label}</p>
                <p className="text-xl font-medium text-cream">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Star distribution</h2>
        <div className="rounded-[26px] bg-white p-5 shadow-card flex flex-col gap-3">
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
        <ReviewsTable reviews={(recentReviews ?? []) as Review[]} />
      </div>
    </div>
  );
}
