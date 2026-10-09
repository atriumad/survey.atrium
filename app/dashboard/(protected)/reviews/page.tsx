import { createClient } from "@/lib/supabase/server";
import { getTenantProfile } from "@/lib/get-profile";
import { describeLocationScope } from "@/lib/location-label";
import { loadReviewsPage } from "@/lib/dashboard-data";
import { ExportButton, ReviewsTable } from "./reviews-table";
import { ReviewsPager } from "./pager";
import { LocationFilter } from "../location-filter";
import { PageHeader } from "../page-header";

const PAGE_SIZE = 25;

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    location?: string;
    classification?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const profile = await getTenantProfile();
  if (!profile) return null;
  const role = profile.role;

  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("client_id", profile.clientId);

  const page = Math.max(1, Number(params.page) || 1);
  const effectiveLocation = profile.role === "manager" ? profile.locationId : params.location;

  const { reviews, totalPages } = await loadReviewsPage(supabase, {
    clientId: profile.clientId,
    locationId: effectiveLocation,
    classification: params.classification,
    from: params.from,
    to: params.to,
    page,
    pageSize: PAGE_SIZE,
  });

  function buildHref(targetPage: number): string {
    const search = new URLSearchParams();
    if (effectiveLocation && role === "admin") search.set("location", effectiveLocation);
    if (params.classification) search.set("classification", params.classification);
    if (params.from) search.set("from", params.from);
    if (params.to) search.set("to", params.to);
    search.set("page", String(targetPage));
    return `?${search.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reviews"
        description={describeLocationScope(profile.role, effectiveLocation, locations ?? [])}
        actions={
          <div className="flex items-center gap-2">
            {profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
            <ExportButton filters={{ location: effectiveLocation ?? null, classification: params.classification ?? null, from: params.from ?? null, to: params.to ?? null }} />
          </div>
        }
      />
      <ReviewsTable reviews={reviews} fillTo={PAGE_SIZE} />
      <ReviewsPager page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
