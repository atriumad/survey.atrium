import { createClient } from "@/lib/supabase/server";
import { ShareGoogle } from "./share-google";

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationSlug: string }>;
  searchParams: Promise<{ c?: string; r?: string }>;
}) {
  const { locationSlug } = await params;
  const { c, r } = await searchParams;
  const isGood = c === "good";

  let showShareGoogle = false;
  let shareComment = "";
  let googleReviewUrl: string | null = null;

  if (isGood && r) {
    const supabase = await createClient();
    const [locationResult, commentResult] = await Promise.all([
      supabase.from("locations").select("google_review_url").eq("slug", locationSlug).single(),
      supabase.rpc("get_review_share_comment", { p_review_id: r }),
    ]);
    googleReviewUrl = locationResult.data?.google_review_url ?? null;
    const comment = commentResult.data ?? null;
    if (!commentResult.error && comment) {
      showShareGoogle = Boolean(googleReviewUrl);
      shareComment = comment;
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-cream">
      <h1 className="text-2xl font-medium text-ink tracking-tight text-center">Thanks for your feedback!</h1>
      {showShareGoogle ? (
        <ShareGoogle reviewUrl={googleReviewUrl!} comment={shareComment} />
      ) : (
        <p className="text-body text-center text-lg">
          Your feedback helps us improve every day.
        </p>
      )}
    </main>
  );
}