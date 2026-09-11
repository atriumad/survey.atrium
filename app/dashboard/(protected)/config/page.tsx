import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { getSiteUrl } from "@/lib/site-url";
import { LocationsSection } from "./locations-section";
import { KeywordsSection } from "./keywords-section";
import { PageHeader } from "../page-header";

export default async function ConfigPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [
    { data: locations, error: locationsError },
    { data: keywords, error: keywordsError },
  ] = await Promise.all([
    supabase.from("locations").select("*").eq("client_id", profile.clientId),
    supabase.from("negative_keywords").select("*").eq("client_id", profile.clientId),
  ]);

  if (locationsError) throw locationsError;
  if (keywordsError) throw keywordsError;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Locations, QR codes, and keywords used to classify reviews."
      />
      <LocationsSection locations={locations ?? []} baseUrl={getSiteUrl()} />
      <KeywordsSection keywords={keywords ?? []} />
    </div>
  );
}