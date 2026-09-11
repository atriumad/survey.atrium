import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { LocationsSection } from "./locations-section";
import { KeywordsSection } from "./keywords-section";
import { PageHeader } from "../page-header";

export default async function ConfigPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: locations }, { data: keywords }] = await Promise.all([
    supabase.from("locations").select("*").eq("client_id", profile.clientId),
    supabase.from("negative_keywords").select("*").eq("client_id", profile.clientId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Locations, QR codes, and keywords used to classify reviews."
      />
      <LocationsSection locations={locations ?? []} />
      <KeywordsSection keywords={keywords ?? []} />
    </div>
  );
}
