import { notFound } from "next/navigation";
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

  try {
    await supabase
      .from("qr_scans")
      .insert({ client_id: location.client_id, location_id: location.id });
  } catch {
    // Scan tracking is best-effort — never block the review page over it.
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <h1 className="text-2xl font-semibold text-center">{location.name}</h1>
      <p className="text-muted-foreground text-center">Cual fue tu experiencia hoy?</p>
      <div className="w-full max-w-sm">
        <ReviewForm locationSlug={locationSlug} />
      </div>
    </main>
  );
}
