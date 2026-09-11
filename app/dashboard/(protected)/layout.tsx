import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { logout } from "./actions";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/dashboard/login");

  const profile = await getProfile();

  if (!profile) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 bg-cream">
        <p className="text-body">You don't have access to this dashboard.</p>
        <form action={logout}>
          <Button type="submit" variant="outline">Sign out</Button>
        </form>
      </main>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-off-white">
      <Sidebar role={profile.role} />
      <main className="flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
