import { createClient } from "@/lib/supabase/server";
import { ShareGoogle } from "./share-google";

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationSlug: string }>;
  searchParams: Promise<{ c?: string; comment?: string }>;
}) {
  const { locationSlug } = await params;
  const { c, comment } = await searchParams;
  const isGood = c === "good";

  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("google_place_id")
    .eq("slug", locationSlug)
    .single();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <h1 className="text-2xl font-semibold text-center">Gracias por tu opinion!</h1>
      {isGood && location?.google_place_id ? (
        <ShareGoogle googlePlaceId={location.google_place_id} comment={comment ?? ""} />
      ) : (
        <p className="text-muted-foreground text-center">
          Tu feedback nos ayuda a mejorar cada dia.
        </p>
      )}
    </main>
  );
}
