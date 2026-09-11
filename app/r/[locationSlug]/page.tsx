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

  const { data: location, error } = await supabase
    .from("locations")
    .select("id, name, client_id")
    .eq("slug", locationSlug)
    .single();

  if (error || !location) {
    if (error && error.code !== "PGRST116") {
      console.error("Location lookup failed", error);
      throw error;
    }
    notFound();
  }

  after(async () => {
    const { error: qrError } = await supabase.rpc("record_qr_scan", {
      p_location_id: location.id,
    });
    if (qrError) console.error("qr_scan write failed", qrError);
  });

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-cream">
      <h1 className="text-2xl font-medium text-ink tracking-tight text-center">{location.name}</h1>
      <p className="text-body text-center text-lg">How was your experience today?</p>
      <div className="w-full max-w-sm">
        <ReviewForm locationSlug={locationSlug} />
      </div>
    </main>
  );
}