import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { summarizeReviews, calculateConversionRate } from "@/lib/metrics";
import { LocationFilter } from "./location-filter";
import { PageHeader } from "./page-header";
import { Card, CardContent } from "@/components/ui/card";
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

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let recentQuery = supabase
    .from("reviews")
    .select("*")
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

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Actividad</h2>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Total reviews" value={summary.total} />
          <MetricCard label="Escaneos QR" value={scansTotal ?? 0} />
          <MetricCard label="Conversion" value={conversionRate === null ? "—" : `${conversionRate}%`} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Calidad</h2>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Rating promedio" value={summary.averageRating.toFixed(1)} />
          <MetricCard label="% Buenas" value={`${summary.goodPercent}%`} />
          <MetricCard label="% Compartidas a Google" value={`${summary.sharedPercent}%`} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Distribucion de estrellas</h2>
        <div className="flex gap-3 items-end h-40">
          {([1, 2, 3, 4, 5] as const).map((star) => (
            <div key={star} className="flex flex-col items-center gap-2 flex-1">
              <div
                className={`w-full rounded-t-[12px] transition-all ${
                  star <= 3 ? "bg-amber" : "bg-green-fill"
                }`}
                style={{
                  height: `${summary.total > 0 ? (summary.starDistribution[star] / summary.total) * 100 : 0}%`,
                }}
              />
              <span className="text-sm text-body">{star}★</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Ultimas 24 horas</h2>
        <ReviewsTable reviews={(recentReviews ?? []) as Review[]} />
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
