"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { reviewsToCsv } from "@/lib/csv";
import type { ReviewWithLocation } from "@/lib/types";

export interface ReviewExportFilters {
  location?: string | null;
  classification?: string | null;
  from?: string | null;
  to?: string | null;
}

export async function exportReviewsCsv(filters: ReviewExportFilters) {
  const profile = await getProfile();
  if (!profile) return { csv: "", filename: "" };

  const supabase = await createClient();

  const effectiveLocation =
    profile.role === "manager" ? profile.locationId : filters.location;

  let query = supabase
    .from("reviews")
    .select("*, location:locations(name)")
    .eq("client_id", profile.clientId)
    .order("created_at", { ascending: false });
  if (effectiveLocation) query = query.eq("location_id", effectiveLocation);
  if (filters.classification) query = query.eq("classification", filters.classification);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);

  const { data, error } = await query;
  if (error) throw error;

  const reviews = (data ?? []) as ReviewWithLocation[];
  const csv = reviewsToCsv(reviews);
  const filename = `reviews-${new Date().toISOString().slice(0, 10)}.csv`;
  return { csv, filename };
}