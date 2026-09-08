import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export interface Profile {
  clientId: string;
  role: Role;
  locationId: string | null;
}

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

  return { clientId: data.client_id, role: data.role as Role, locationId: data.location_id };
}
