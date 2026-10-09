import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { loadReviewsPage } from "@/lib/dashboard-data";
import { ReviewsTable } from "@/app/dashboard/(protected)/reviews/reviews-table";
import { ReviewsPager } from "@/app/dashboard/(protected)/reviews/pager";
import { LocationFilter } from "@/app/dashboard/(protected)/location-filter";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

export default async function ClientReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{
    location?: string | string[];
    classification?: string | string[];
    from?: string | string[];
    to?: string | string[];
    page?: string | string[];
  }>;
}) {
  await requireSuperadmin();
  const { clientId } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const { data: locations, error } = await admin.from("locations").select("id, name").eq("client_id", clientId);
  if (error) throw error;

  const locationId =
    typeof sp.location === "string" && z.uuid().safeParse(sp.location).success ? sp.location : undefined;
  const classification = sp.classification === "good" || sp.classification === "bad" ? sp.classification : undefined;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : undefined) || 1);
  const { reviews, totalPages } = await loadReviewsPage(admin, {
    clientId,
    locationId,
    classification,
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  });

  function buildHref(targetPage: number): string {
    const search = new URLSearchParams();
    if (locationId) search.set("location", locationId);
    if (classification) search.set("classification", classification);
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    search.set("page", String(targetPage));
    return `?${search.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {(locations ?? []).length > 0 && (
        <div className="flex justify-end">
          <LocationFilter locations={locations ?? []} />
        </div>
      )}
      {reviews.length === 0 ? (
        <p className="text-sm text-body">No reviews match these filters.</p>
      ) : (
        <ReviewsTable reviews={reviews} fillTo={PAGE_SIZE} />
      )}
      <ReviewsPager page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
