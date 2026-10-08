import { redirect } from "next/navigation";
import { getProfile } from "@/lib/get-profile";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile || profile.role !== "superadmin") redirect("/dashboard");
  return <>{children}</>;
}
