import { notFound } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ReviewForm } from "./review-form";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locationSlug: string }>;
}) {
  const { locationSlug } = await params;
  const supabase = await createClient();

  const { data: location } = await supabase
    .from("locations")
    .select("id, name, client_id")
    .eq("slug", locationSlug)
    .single();

  if (!location) {
    notFound();
  }

  after(async () => {
    const { error } = await supabase
      .from("qr_scans")
      .insert({ client_id: location.client_id, location_id: location.id });
    if (error) console.error("qr_scan insert failed", error);
  });

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-cream">
      <h1 className="text-2xl font-medium text-ink text-center">{location.name}</h1>
      <p className="text-body text-center text-lg">Cual fue tu experiencia hoy?</p>
      <div className="w-full max-w-sm">
        <ReviewForm locationSlug={locationSlug} />
      </div>
    </main>
  );
}
