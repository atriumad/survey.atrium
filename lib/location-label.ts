export function describeLocationScope(
  role: "admin" | "manager",
  effectiveLocation: string | null | undefined,
  locations: { id: string; name: string }[]
): string {
  if (effectiveLocation) {
    return locations.find((l) => l.id === effectiveLocation)?.name ?? "Unknown location";
  }
  return role === "manager" ? "No location assigned" : "All locations";
}
