import { createClient } from "@/lib/supabase/server";
import { ShareGoogle } from "./share-google";

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationSlug: string }>;
  searchParams: Promise<{ c?: string; comment?: string; s?: string }>;
}) {
  const { locationSlug } = await params;
  const { c, comment, s } = await searchParams;
  const isGood = c === "good";
  const sharedToGoogle = isGood && s === "1";

  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("google_place_id")
    .eq("slug", locationSlug)
    .single();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-cream">
      <h1 className="text-3xl font-serif italic text-ink text-center">Gracias por tu opinion!</h1>
      {sharedToGoogle && location?.google_place_id ? (
        <ShareGoogle googlePlaceId={location.google_place_id} comment={comment ?? ""} />
      ) : (
        <p className="text-body text-center text-lg">
          Tu feedback nos ayuda a mejorar cada dia.
        </p>
      )}
    </main>
  );
}
