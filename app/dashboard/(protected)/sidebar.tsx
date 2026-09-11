"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { logout } from "./actions";
import type { Role } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/reviews", label: "Reviews" },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items =
    role === "admin" ? [...NAV_ITEMS, { href: "/dashboard/config", label: "Config" }] : NAV_ITEMS;

  return (
    <aside className="flex flex-row lg:flex-col w-full lg:w-56 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-cool bg-off-white lg:sticky lg:top-0 lg:h-screen">
      <div className="hidden lg:block p-4">
        <p className="text-sm font-semibold text-ink">Atrium</p>
        <p className="text-xs text-body capitalize">{role}</p>
      </div>
      <nav className="flex-1 flex flex-row lg:flex-col gap-1 p-3 overflow-x-auto">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-[14px] px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                active ? "bg-white shadow-card text-ink" : "text-body hover:bg-white/60 hover:text-ink"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 lg:mt-auto">
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            Cerrar sesion
          </Button>
        </form>
      </div>
    </aside>
  );
}
