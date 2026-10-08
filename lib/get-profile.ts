import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export type Profile =
  | { role: Extract<Role, "superadmin">; clientId: null; locationId: null }
  | { role: Exclude<Role, "superadmin">; clientId: string; locationId: string | null };

export type TenantProfile = Extract<Profile, { clientId: string }>;

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("client_id, role, location_id")
    .eq("id", user.id)
    .single();

  if (!data) return null;

  // Strict pairing, mirroring the profiles_client_required check: a superadmin
  // has no client, every tenant role has one. Anything else is untrusted.
  if (data.role === "superadmin" && data.client_id === null) {
    return { role: "superadmin", clientId: null, locationId: null };
  }

  if ((data.role === "admin" || data.role === "manager") && typeof data.client_id === "string") {
    return { role: data.role, clientId: data.client_id, locationId: data.location_id };
  }

  return null;
}

// For pages and actions that only make sense inside one tenant. Superadmins
// have no client, so they are sent to the admin panel instead.
export async function getTenantProfile(): Promise<TenantProfile | null> {
  const profile = await getProfile();
  if (!profile) return null;
  if (profile.role === "superadmin") redirect("/dashboard/admin");
  return profile;
}
