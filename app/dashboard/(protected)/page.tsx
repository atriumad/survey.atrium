import { createClient } from "@/lib/supabase/server";
import { getTenantProfile } from "@/lib/get-profile";
import { describeLocationScope } from "@/lib/location-label";
import { loadOverviewData } from "@/lib/dashboard-data";
import { OverviewView } from "@/components/dashboard/overview-view";
import { LocationFilter } from "./location-filter";
import { PageHeader } from "./page-header";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  const profile = await getTenantProfile();
  if (!profile) return null;

  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("client_id", profile.clientId);

  const effectiveLocation = profile.role === "manager" ? profile.locationId : location;
  const data = await loadOverviewData(supabase, {
    clientId: profile.clientId,
    locationId: effectiveLocation,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description={describeLocationScope(profile.role, effectiveLocation, locations ?? [])}
        actions={profile.role === "admin" && <LocationFilter locations={locations ?? []} />}
      />
      <OverviewView data={data} />
    </div>
  );
}
