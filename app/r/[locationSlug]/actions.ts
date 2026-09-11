"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { reviewSubmitSchema } from "@/lib/validation";
import { classifyReview } from "@/lib/classify";
import { isRateLimited } from "@/lib/rate-limit";

export async function submitReview(formData: FormData) {
  const parsed = reviewSubmitSchema.safeParse({
    locationSlug: formData.get("locationSlug"),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    rating: Number(formData.get("rating")),
    comment: formData.get("comment") ?? "",
    sharedToGoogle: formData.get("sharedToGoogle") === "true",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid submission");
  }

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) {
    throw new Error("Please wait a moment before submitting another review");
  }

  const { locationSlug, email, rating, comment, sharedToGoogle: requestedShareToGoogle } =
    parsed.data;
  const supabase = await createClient();

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id, client_id")
    .eq("slug", locationSlug)
    .single();

  if (locationError || !location) {
    if (locationError) console.error("Location lookup failed", locationError);
    throw new Error("Location not found");
  }

  const { data: keywordRows } = await supabase
    .from("negative_keywords")
    .select("keyword")
    .eq("client_id", location.client_id);

  const { classification, matchedKeywords } = classifyReview({
    rating,
    comment,
    negativeKeywords: (keywordRows ?? []).map((row) => row.keyword),
  });

  const sharedToGoogle = requestedShareToGoogle && classification === "good";

  const { error: insertError } = await supabase.from("reviews").insert({
    client_id: location.client_id,
    location_id: location.id,
    rating,
    comment: comment || null,
    email,
    classification,
    matched_keywords: matchedKeywords.length > 0 ? matchedKeywords : null,
    shared_to_google: sharedToGoogle,
  });

  if (insertError) {
    console.error("Could not save review", insertError);
    throw new Error("Could not save review");
  }

  if (classification === "good") {
    redirect(
      `/r/${locationSlug}/gracias?c=${classification}&s=${
        sharedToGoogle ? "1" : "0"
      }&comment=${encodeURIComponent(comment)}`
    );
  }

  redirect(`/r/${locationSlug}/gracias?c=${classification}`);
}