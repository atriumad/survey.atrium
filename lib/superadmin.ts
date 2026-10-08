import { getProfile } from "@/lib/get-profile";

export async function requireSuperadmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "superadmin") throw new Error("Forbidden");
  return profile;
}
