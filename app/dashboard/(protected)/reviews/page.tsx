import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { ExportButton, ReviewsTable } from "./reviews-table";
import { ReviewsPager } from "./pager";
import { LocationFilter } from "../location-filter";
import { PageHeader } from "../page-header";
import type { ReviewWithLocation } from "@/lib/types";

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
  const profile = await getProfile();
  if (!profile) return null;
  const role = profile.role;

  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("client_id", profile.clientId);

  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const effectiveLocation = profile.role === "manager" ? profile.locationId : params.location;

  let query = supabase
    .from("reviews")
    .select("*, location:locations(name)")
    .eq("client_id", profile.clientId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (effectiveLocation) query = query.eq("location_id", effectiveLocation);
  if (params.classification) query = query.eq("classification", params.classification);
  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", params.to);

  let countQuery = supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("client_id", profile.clientId);
  if (effectiveLocation) countQuery = countQuery.eq("location_id", effectiveLocation);
  if (params.classification) countQuery = countQuery.eq("classification", params.classification);
  if (params.from) countQuery = countQuery.gte("created_at", params.from);
  if (params.to) countQuery = countQuery.lte("created_at", params.to);

  const [{ data: reviews }, { count }] = await Promise.all([query, countQuery]);
  const reviewsList = (reviews ?? []) as ReviewWithLocation[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

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
        actions={
          <div className="flex items-center gap-2">
            {profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
            <ExportButton filters={{ location: effectiveLocation ?? null, classification: params.classification ?? null, from: params.from ?? null, to: params.to ?? null }} />
          </div>
        }
      />
      <ReviewsTable reviews={reviewsList} fillTo={PAGE_SIZE} />
      <ReviewsPager page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
