"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reviewSubmitSchema } from "@/lib/validation";
import { classifyReview } from "@/lib/classify";

export async function submitReview(formData: FormData) {
  const parsed = reviewSubmitSchema.safeParse({
    locationSlug: formData.get("locationSlug"),
    rating: Number(formData.get("rating")),
    comment: formData.get("comment") ?? "",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid submission");
  }

  const { locationSlug, rating, comment } = parsed.data;
  const supabase = await createClient();

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id, client_id")
    .eq("slug", locationSlug)
    .single();

  if (locationError || !location) {
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

  const { error: insertError } = await supabase.from("reviews").insert({
    client_id: location.client_id,
    location_id: location.id,
    rating,
    comment: comment || null,
    classification,
    matched_keywords: matchedKeywords.length > 0 ? matchedKeywords : null,
  });

  if (insertError) {
    throw new Error("Could not save review");
  }

  redirect(`/r/${locationSlug}/gracias?c=${classification}`);
}
