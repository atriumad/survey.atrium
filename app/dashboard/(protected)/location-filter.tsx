"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LocationFilter({ locations }: { locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("location") ?? "all";

  const items: Record<string, string> = { all: "All locations" };
  for (const loc of locations) items[loc.id] = loc.name;

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams);
        if (value === "all" || value === null) params.delete("location");
        else params.set("location", value);
        router.push(`?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All locations</SelectItem>
        {locations.map((loc) => (
          <SelectItem key={loc.id} value={loc.id}>
            {loc.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
