import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { loadOverviewData } from "@/lib/dashboard-data";
import { describeLocationScope } from "@/lib/location-label";
import { OverviewView } from "@/components/dashboard/overview-view";
import { LocationFilter } from "@/app/dashboard/(protected)/location-filter";

export const dynamic = "force-dynamic";

export default async function ClientSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  await requireSuperadmin();
  const { clientId } = await params;
  const { location } = await searchParams;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const { data: locations, error } = await admin.from("locations").select("id, name").eq("client_id", clientId);
  if (error) throw error;

  // A location id from another client matches nothing: the loader also filters by client_id.
  const data = await loadOverviewData(admin, { clientId, locationId: location });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-body">{describeLocationScope("admin", location, locations ?? [])}</p>
        {(locations ?? []).length > 0 && <LocationFilter locations={locations ?? []} />}
      </div>
      <OverviewView data={data} />
    </div>
  );
}
