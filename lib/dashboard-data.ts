import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateConversionRate,
  describeAverageRating,
  describeRatingTrend,
  summarizeReviews,
  type RatingTrend,
  type ReviewSummary,
} from "@/lib/metrics";
import type { Review, ReviewWithLocation } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number, now: number): string {
  return new Date(now - days * DAY_MS).toISOString();
}

function averageOf(ratings: number[]): number {
  return ratings.length === 0 ? 0 : ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

export interface OverviewScope {
  clientId: string;
  locationId?: string | null;
}

export interface OverviewData {
  summary: ReviewSummary;
  scansTotal: number;
  conversionRate: number | null;
  ratingTier: string;
  trend: RatingTrend | null;
  recentReviews: ReviewWithLocation[];
}

export async function loadOverviewData(
  supabase: SupabaseClient,
  scope: OverviewScope,
  now: number = Date.now()
): Promise<OverviewData> {
  const { clientId, locationId } = scope;

  let reviewsQuery = supabase.from("reviews").select("*").eq("client_id", clientId);
  if (locationId) reviewsQuery = reviewsQuery.eq("location_id", locationId);

  let scansQuery = supabase
    .from("qr_scans")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId);
  if (locationId) scansQuery = scansQuery.eq("location_id", locationId);

  let currentQuery = supabase
    .from("reviews")
    .select("rating")
    .eq("client_id", clientId)
    .gte("created_at", daysAgoIso(30, now));
  if (locationId) currentQuery = currentQuery.eq("location_id", locationId);

  let previousQuery = supabase
    .from("reviews")
    .select("rating")
    .eq("client_id", clientId)
    .gte("created_at", daysAgoIso(60, now))
    .lt("created_at", daysAgoIso(30, now));
  if (locationId) previousQuery = previousQuery.eq("location_id", locationId);

  let recentQuery = supabase
    .from("reviews")
    .select("*, location:locations(name)")
    .eq("client_id", clientId)
    .gte("created_at", daysAgoIso(1, now))
    .order("created_at", { ascending: false });
  if (locationId) recentQuery = recentQuery.eq("location_id", locationId);

  const [reviewsRes, scansRes, currentRes, previousRes, recentRes] = await Promise.all([
    reviewsQuery,
    scansQuery,
    currentQuery,
    previousQuery,
    recentQuery,
  ]);
  for (const res of [reviewsRes, scansRes, currentRes, previousRes, recentRes]) {
    if (res.error) throw res.error;
  }

  const summary = summarizeReviews((reviewsRes.data ?? []) as Review[]);
  const scansTotal = scansRes.count ?? 0;
  const currentRatings = ((currentRes.data ?? []) as { rating: number }[]).map((r) => r.rating);
  const previousRatings = ((previousRes.data ?? []) as { rating: number }[]).map((r) => r.rating);

  return {
    summary,
    scansTotal,
    conversionRate: calculateConversionRate(summary.total, scansTotal),
    ratingTier: describeAverageRating(summary.averageRating, summary.total),
    trend: describeRatingTrend(averageOf(currentRatings), averageOf(previousRatings), previousRatings.length),
    recentReviews: (recentRes.data ?? []) as ReviewWithLocation[],
  };
}

export interface ReviewsPageParams {
  clientId: string;
  locationId?: string | null;
  classification?: string | null;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
}

export async function loadReviewsPage(
  supabase: SupabaseClient,
  params: ReviewsPageParams
): Promise<{ reviews: ReviewWithLocation[]; totalPages: number }> {
  const { clientId, locationId, classification, from, to, page, pageSize } = params;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  let query = supabase
    .from("reviews")
    .select("*, location:locations(name)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .range(start, end);
  let countQuery = supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId);

  if (locationId) {
    query = query.eq("location_id", locationId);
    countQuery = countQuery.eq("location_id", locationId);
  }
  if (classification) {
    query = query.eq("classification", classification);
    countQuery = countQuery.eq("classification", classification);
  }
  if (from) {
    query = query.gte("created_at", from);
    countQuery = countQuery.gte("created_at", from);
  }
  if (to) {
    query = query.lte("created_at", to);
    countQuery = countQuery.lte("created_at", to);
  }

  const [reviewsRes, countRes] = await Promise.all([query, countQuery]);
  if (reviewsRes.error) throw reviewsRes.error;
  if (countRes.error) throw countRes.error;

  return {
    reviews: (reviewsRes.data ?? []) as ReviewWithLocation[],
    totalPages: Math.max(1, Math.ceil((countRes.count ?? 0) / pageSize)),
  };
}

export interface RawClientRow {
  id: string;
  name: string;
  slug: string;
  locations?: { count: number }[] | null;
  profiles?: { count: number }[] | null;
  reviews?: { created_at: string }[] | null;
}

export interface ClientIndexRow {
  id: string;
  name: string;
  slug: string;
  locationsCount: number;
  usersCount: number;
  lastReviewAt: string | null;
}

export function toClientIndexRow(raw: RawClientRow): ClientIndexRow {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    locationsCount: raw.locations?.[0]?.count ?? 0,
    usersCount: raw.profiles?.[0]?.count ?? 0,
    lastReviewAt: raw.reviews?.[0]?.created_at ?? null,
  };
}

export async function loadClientsIndex(admin: SupabaseClient): Promise<ClientIndexRow[]> {
  const { data, error } = await admin
    .from("clients")
    .select("id, name, slug, locations(count), profiles(count), reviews(created_at)")
    .order("name")
    .order("created_at", { ascending: false, referencedTable: "reviews" })
    .limit(1, { referencedTable: "reviews" });
  if (error) throw error;
  return ((data ?? []) as RawClientRow[]).map(toClientIndexRow);
}

export interface AgencyOverview {
  totals: { clients: number; locations: number; reviews30d: number; average30d: number };
  recentClients: ClientIndexRow[];
}

export function buildAgencyOverview(clients: ClientIndexRow[], ratings30d: number[]): AgencyOverview {
  const byRecency = [...clients].sort((a, b) => {
    if (a.lastReviewAt && b.lastReviewAt) return b.lastReviewAt.localeCompare(a.lastReviewAt);
    if (a.lastReviewAt) return -1;
    if (b.lastReviewAt) return 1;
    return 0;
  });
  return {
    totals: {
      clients: clients.length,
      locations: clients.reduce((sum, c) => sum + c.locationsCount, 0),
      reviews30d: ratings30d.length,
      average30d: averageOf(ratings30d),
    },
    recentClients: byRecency.slice(0, 5),
  };
}

export async function loadAgencyOverview(admin: SupabaseClient, now: number = Date.now()): Promise<AgencyOverview> {
  const [clients, ratingsRes] = await Promise.all([
    loadClientsIndex(admin),
    admin.from("reviews").select("rating").gte("created_at", daysAgoIso(30, now)),
  ]);
  if (ratingsRes.error) throw ratingsRes.error;
  const ratings = ((ratingsRes.data ?? []) as { rating: number }[]).map((r) => r.rating);
  return buildAgencyOverview(clients, ratings);
}
