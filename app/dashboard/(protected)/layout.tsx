import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/get-profile";
import { logout } from "./actions";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/dashboard/login");

  const profile = await getProfile();

  if (!profile) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4">
        <p>No tenes acceso a este dashboard.</p>
        <form action={logout}>
          <Button type="submit" variant="outline">Cerrar sesion</Button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b p-4 flex justify-between items-center">
        <nav className="flex gap-4">
          <Link href="/dashboard">Metricas</Link>
          <Link href="/dashboard/reviews">Reviews</Link>
          {profile.role === "admin" && <Link href="/dashboard/config">Config</Link>}
        </nav>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">Cerrar sesion</Button>
        </form>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
