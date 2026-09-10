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
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 bg-cream">
        <p className="text-body">No tenes acceso a este dashboard.</p>
        <form action={logout}>
          <Button type="submit" variant="outline">Cerrar sesion</Button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-off-white">
      <header className="border-b border-cool bg-white/80 backdrop-blur px-6 py-3 flex justify-between items-center sticky top-0">
        <nav className="flex gap-1">
          <Link
            href="/dashboard"
            className="rounded-full px-4 py-2 text-sm font-medium text-body hover:bg-muted hover:text-ink transition-colors"
          >
            Metricas
          </Link>
          <Link
            href="/dashboard/reviews"
            className="rounded-full px-4 py-2 text-sm font-medium text-body hover:bg-muted hover:text-ink transition-colors"
          >
            Reviews
          </Link>
          {profile.role === "admin" && (
            <Link
              href="/dashboard/config"
              className="rounded-full px-4 py-2 text-sm font-medium text-body hover:bg-muted hover:text-ink transition-colors"
            >
              Config
            </Link>
          )}
        </nav>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">Cerrar sesion</Button>
        </form>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
