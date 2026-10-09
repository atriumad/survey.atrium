"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export function ClientTabs({
  clientId,
  counts,
}: {
  clientId: string;
  counts: { locations: number; users: number };
}) {
  const pathname = usePathname();
  const base = `/dashboard/admin/clients/${clientId}`;
  const tabs = [
    { href: base, label: "Summary" },
    { href: `${base}/locations`, label: `Locations (${counts.locations})` },
    { href: `${base}/users`, label: `Users (${counts.users})` },
    { href: `${base}/reviews`, label: "Reviews" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav aria-label="Client sections" className="flex gap-1 overflow-x-auto border-b border-cool">
      {tabs.map((tab) => {
        const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              active ? "border-ink text-ink" : "border-transparent text-body hover:text-ink"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
