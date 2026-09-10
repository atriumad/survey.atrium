import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { ExportButton, ReviewsTable } from "./reviews-table";
import { LocationFilter } from "../location-filter";
import { PageHeader } from "../page-header";
import type { Review } from "@/lib/types";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; classification?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("client_id", profile.clientId);

  let query = supabase
    .from("reviews")
    .select("*")
    .eq("client_id", profile.clientId)
    .order("created_at", { ascending: false });

  const effectiveLocation = profile.role === "manager" ? profile.locationId : params.location;
  if (effectiveLocation) query = query.eq("location_id", effectiveLocation);
  if (params.classification) query = query.eq("classification", params.classification);
  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", params.to);

  const { data: reviews } = await query;
  const reviewsList = (reviews ?? []) as Review[];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reviews"
        actions={
          <div className="flex items-center gap-2">
            {profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
            <ExportButton reviews={reviewsList} />
          </div>
        }
      />
      <ReviewsTable reviews={reviewsList} />
    </div>
  );
}
