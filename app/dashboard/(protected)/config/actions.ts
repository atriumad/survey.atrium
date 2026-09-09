"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";

async function requireAdmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");
  return profile;
}

export async function createLocation(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("locations").insert({
    client_id: profile.clientId,
    name: String(formData.get("name")),
    slug: String(formData.get("slug")),
    google_place_id: String(formData.get("googlePlaceId") || "") || null,
  });
  revalidatePath("/dashboard/config");
}

export async function deleteLocation(locationId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("locations").delete().eq("id", locationId);
  revalidatePath("/dashboard/config");
}

export async function createKeyword(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("negative_keywords").insert({
    client_id: profile.clientId,
    keyword: String(formData.get("keyword")),
  });
  revalidatePath("/dashboard/config");
}

export async function deleteKeyword(keywordId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("negative_keywords").delete().eq("id", keywordId);
  revalidatePath("/dashboard/config");
}