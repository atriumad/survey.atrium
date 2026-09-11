export type Classification = "good" | "bad";

export type Role = "admin" | "manager";

export interface Review {
  id: string;
  client_id: string;
  location_id: string;
  rating: number;
  comment: string | null;
  email: string | null;
  classification: Classification;
  matched_keywords: string[] | null;
  shared_to_google: boolean;
  created_at: string;
}

export interface ReviewWithLocation extends Review {
  location: { name: string } | null;
}

export interface Location {
  id: string;
  client_id: string;
  name: string;
  slug: string;
  google_place_id: string | null;
  created_at: string;
}
