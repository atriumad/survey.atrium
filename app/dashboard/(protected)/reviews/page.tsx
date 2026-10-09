import { z } from "zod";
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
    location?: string | string[];
    classification?: string | string[];
    from?: string | string[];
    to?: string | string[];
    page?: string | string[];
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

  const pageNumber = Number(typeof params.page === "string" ? params.page : undefined);
  const page = Number.isSafeInteger(pageNumber) ? Math.max(1, pageNumber) : 1;
  const requestedLocation =
    typeof params.location === "string" && z.uuid().safeParse(params.location).success
      ? params.location
      : undefined;
  const classification =
    params.classification === "good" || params.classification === "bad" ? params.classification : undefined;
  const from = typeof params.from === "string" && !Number.isNaN(Date.parse(params.from)) ? params.from : undefined;
  const to = typeof params.to === "string" && !Number.isNaN(Date.parse(params.to)) ? params.to : undefined;
  const effectiveLocation = profile.role === "manager" ? profile.locationId : requestedLocation;

  const { reviews, totalPages } = await loadReviewsPage(supabase, {
    clientId: profile.clientId,
    locationId: effectiveLocation,
    classification,
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  });

  function buildHref(targetPage: number): string {
    const search = new URLSearchParams();
    if (effectiveLocation && role === "admin") search.set("location", effectiveLocation);
    if (classification) search.set("classification", classification);
    if (from) search.set("from", from);
    if (to) search.set("to", to);
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
            <ExportButton filters={{ location: effectiveLocation ?? null, classification: classification ?? null, from: from ?? null, to: to ?? null }} />
          </div>
        }
      />
      <ReviewsTable reviews={reviews} fillTo={PAGE_SIZE} />
      <ReviewsPager page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
