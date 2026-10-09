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
    .rpc("get_public_location", { p_slug: locationSlug })
    .single<{
      id: string;
      name: string;
      google_review_url: string | null;
      client_name?: string | null;
      client_logo_url?: string | null;
    }>();

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

  const restaurantName = location.client_name?.trim() || null;
  const showRestaurant = restaurantName && restaurantName.toLowerCase() !== location.name.trim().toLowerCase();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-cream">
      <header className="flex flex-col items-center gap-2 text-center break-words">
        {location.client_logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={location.client_logo_url}
            alt=""
            className="max-h-16 w-auto object-contain"
          />
        )}
        {showRestaurant && (
          <h1 className="text-2xl font-medium text-ink tracking-tight">{restaurantName}</h1>
        )}
        {showRestaurant ? (
          <p className="text-lg text-body">{location.name}</p>
        ) : (
          <h1 className="text-2xl font-medium text-ink tracking-tight">{location.name}</h1>
        )}
      </header>
      <p className="text-body text-center text-lg">How was your experience today?</p>
      <div className="w-full max-w-sm">
        <ReviewForm locationSlug={locationSlug} />
      </div>
    </main>
  );
}