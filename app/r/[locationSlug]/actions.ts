"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { reviewSubmitSchema } from "@/lib/validation";
import {
  buildRateLimitKey,
  consumeRateLimit,
  getRequestIp,
  SUBMIT_REVIEW_POLICY,
} from "@/lib/rate-limit";

interface SubmitReviewResult {
  review_id: string;
  classification: string;
  shared_to_google: boolean;
}

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
  const ip = getRequestIp(headersList);
  const supabase = await createClient();
  const allowed = await consumeRateLimit(
    supabase,
    buildRateLimitKey(ip, "submit-review"),
    SUBMIT_REVIEW_POLICY
  );

  if (!allowed) {
    throw new Error("Please wait a moment before submitting another review");
  }

  const { locationSlug, email, rating, comment, sharedToGoogle } = parsed.data;

  const { data, error } = await supabase.rpc("submit_review", {
    p_location_slug: locationSlug,
    p_rating: rating,
    p_comment: comment,
    p_email: email,
    p_requested_google: sharedToGoogle,
  });

  if (error) {
    console.error("submit_review failed", error);
    if (error.message.includes("LOCATION_NOT_FOUND")) {
      throw new Error("Location not found");
    }
    throw new Error("Could not save review");
  }

  const row = (data as SubmitReviewResult[] | null)?.[0];
  if (!row?.review_id || !row.classification) {
    console.error("submit_review returned no row", data);
    throw new Error("Could not save review");
  }

  redirect(`/r/${locationSlug}/gracias?c=${row.classification}&r=${row.review_id}`);
}