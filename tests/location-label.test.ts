import { describe, expect, it } from "vitest";
import { describeLocationScope } from "@/lib/location-label";

const locations = [
  { id: "l1", name: "Centro" },
  { id: "l2", name: "Norte" },
];

describe("describeLocationScope", () => {
  it("names the selected location", () => {
    expect(describeLocationScope("admin", "l2", locations)).toBe("Norte");
  });

  it("says all locations for an admin without a filter", () => {
    expect(describeLocationScope("admin", undefined, locations)).toBe("All locations");
  });

  it("names a manager's own location", () => {
    expect(describeLocationScope("manager", "l1", locations)).toBe("Centro");
  });

  it("flags a manager with no assigned location", () => {
    expect(describeLocationScope("manager", null, locations)).toBe("No location assigned");
  });

  it("does not leak an id that is not in the list", () => {
    expect(describeLocationScope("admin", "zzz", locations)).toBe("Unknown location");
  });
});
