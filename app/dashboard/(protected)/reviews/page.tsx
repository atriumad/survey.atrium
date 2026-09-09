import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { ReviewsTable } from "./reviews-table";
import { LocationFilter } from "../location-filter";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Reviews</h1>
        {profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      </div>
      <ReviewsTable reviews={(reviews ?? []) as Review[]} />
    </div>
  );
}