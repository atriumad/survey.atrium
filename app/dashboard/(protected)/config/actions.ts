"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { locationFormSchema, keywordFormSchema } from "@/lib/validation";

async function requireAdmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");
  return profile;
}

export async function createLocation(formData: FormData) {
  const profile = await requireAdmin();
  const parsed = locationFormSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    googleReviewUrl: formData.get("googleReviewUrl"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid location");
  }

  const { name, slug, googleReviewUrl } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({
    client_id: profile.clientId,
    name,
    slug,
    google_review_url: googleReviewUrl,
  });
  if (error) throw error;
  revalidatePath("/dashboard/config");
}

export async function deleteLocation(locationId: string) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("locations")
    .delete()
    .eq("id", locationId)
    .eq("client_id", profile.clientId);
  if (error) throw error;
  revalidatePath("/dashboard/config");
}

export async function createKeyword(formData: FormData) {
  const profile = await requireAdmin();
  const parsed = keywordFormSchema.safeParse({
    keyword: formData.get("keyword"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid keyword");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("negative_keywords").insert({
    client_id: profile.clientId,
    keyword: parsed.data.keyword,
  });
  if (error) throw error;
  revalidatePath("/dashboard/config");
}

export async function deleteKeyword(keywordId: string) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("negative_keywords")
    .delete()
    .eq("id", keywordId)
    .eq("client_id", profile.clientId);
  if (error) throw error;
  revalidatePath("/dashboard/config");
}