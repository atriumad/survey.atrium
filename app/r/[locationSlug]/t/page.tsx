import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { GoogleAsk } from "./google-ask";

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationSlug: string }>;
  searchParams: Promise<{ c?: string; r?: string }>;
}) {
  const { locationSlug } = await params;
  const { c, r } = await searchParams;

  // Not a real submission result: send the visitor back to the form.
  if (c !== "good" && c !== "bad") redirect(`/r/${locationSlug}`);

  if (c === "bad") {
    return (
      <Shell title="Thank you">
        <p className="text-body text-center text-lg max-w-sm">
          We&apos;re sorry about your experience. Someone from our team will contact you as soon
          as possible.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const { data: location } = await supabase
    .rpc("get_public_location", { p_slug: locationSlug })
    .maybeSingle<{ google_review_url: string | null }>();
  const reviewUrl = location?.google_review_url ?? null;
  const reviewId = z.uuid().safeParse(r).success ? (r as string) : null;

  return (
    <Shell title="Thanks for your feedback!">
      {reviewUrl ? (
        <GoogleAsk reviewId={reviewId} reviewUrl={reviewUrl} />
      ) : (
        <p className="text-body text-center text-lg max-w-sm">
          We&apos;re glad you enjoyed your visit. See you soon!
        </p>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-cream">
      <h1 className="text-2xl font-medium text-ink tracking-tight text-center">{title}</h1>
      {children}
    </main>
  );
}
