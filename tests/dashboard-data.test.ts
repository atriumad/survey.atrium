import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAgencyOverview,
  loadAgencyOverview,
  loadClientsIndex,
  loadOverviewData,
  loadReviewsPage,
  toClientIndexRow,
} from "@/lib/dashboard-data";

type Op = [string, ...unknown[]];
type Result = {
  data?: unknown;
  count?: number | null;
  error?: unknown;
};
type TableResult = Result | { data: (call: number) => unknown; count?: number | null; error?: unknown };

function fakeSupabase(tables: Record<string, TableResult>) {
  const calls: { table: string; ops: Op[] }[] = [];
  const invocations: Record<string, number> = {};
  const from = (table: string) => {
    const call = { table, ops: [] as Op[] };
    calls.push(call);
    const index = invocations[table] ?? 0;
    invocations[table] = index + 1;
    const result = tables[table] ?? { data: [] };
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "gte", "lt", "lte", "order", "range", "limit"]) {
      builder[op] = (...args: unknown[]) => {
        call.ops.push([op, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) => {
      const data = typeof result.data === "function" ? result.data(index) : result.data;
      return resolve({ data: data ?? null, count: result.count ?? null, error: result.error ?? null });
    };
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const review = (rating: number, classification: "good" | "bad" = "good") => ({
  id: `r${rating}`,
  client_id: "c1",
  location_id: "l1",
  rating,
  comment: null,
  email: null,
  classification,
  matched_keywords: null,
  shared_to_google: false,
  created_at: "2026-10-01T00:00:00Z",
});

const hasOp = (ops: Op[], name: string, ...args: unknown[]) =>
  ops.some((op) => op[0] === name && args.every((a, i) => op[i + 1] === a));

describe("loadOverviewData", () => {
  it("scopes every query to the client", async () => {
    const { client, calls } = fakeSupabase({ reviews: { data: [review(5)] }, qr_scans: { count: 4 } });
    await loadOverviewData(client, { clientId: "c1" });
    expect(calls.length).toBe(5);
    for (const call of calls) expect(hasOp(call.ops, "eq", "client_id", "c1")).toBe(true);
  });

  it("applies the location filter to every query only when given", async () => {
    const withLoc = fakeSupabase({ reviews: { data: [] }, qr_scans: { count: 0 } });
    await loadOverviewData(withLoc.client, { clientId: "c1", locationId: "l9" });
    for (const call of withLoc.calls) expect(hasOp(call.ops, "eq", "location_id", "l9")).toBe(true);

    const noLoc = fakeSupabase({ reviews: { data: [] }, qr_scans: { count: 0 } });
    await loadOverviewData(noLoc.client, { clientId: "c1", locationId: null });
    for (const call of noLoc.calls) expect(call.ops.some((op) => op[0] === "eq" && op[1] === "location_id")).toBe(false);
  });

  it("summarizes reviews and computes conversion from scans", async () => {
    const { client } = fakeSupabase({
      reviews: { data: [review(5), review(1, "bad")] },
      qr_scans: { count: 4 },
    });
    const data = await loadOverviewData(client, { clientId: "c1" });
    expect(data.summary.total).toBe(2);
    expect(data.summary.averageRating).toBe(3);
    expect(data.scansTotal).toBe(4);
    expect(data.conversionRate).toBe(50);
    expect(data.ratingTier).toBe("Average");
  });

  it("handles an empty client", async () => {
    const { client } = fakeSupabase({ reviews: { data: [] }, qr_scans: { count: 0 } });
    const data = await loadOverviewData(client, { clientId: "c1" });
    expect(data.summary.total).toBe(0);
    expect(data.conversionRate).toBeNull();
    expect(data.ratingTier).toBe("No data yet");
    expect(data.trend).toBeNull();
    expect(data.recentReviews).toEqual([]);
  });

  it("throws when a query fails", async () => {
    const { client } = fakeSupabase({ reviews: { error: new Error("boom") }, qr_scans: { count: 0 } });
    await expect(loadOverviewData(client, { clientId: "c1" })).rejects.toThrow("boom");
  });
});

describe("loadReviewsPage", () => {
  it("scopes by client, composes filters and pages with range", async () => {
    const { client, calls } = fakeSupabase({ reviews: { data: [review(5)], count: 60 } });
    const result = await loadReviewsPage(client, {
      clientId: "c1",
      locationId: "l1",
      classification: "bad",
      from: "2026-01-01",
      to: "2026-02-01",
      page: 3,
      pageSize: 25,
    });
    expect(result.totalPages).toBe(3);
    expect(result.reviews).toHaveLength(1);
    for (const call of calls) {
      expect(hasOp(call.ops, "eq", "client_id", "c1")).toBe(true);
      expect(hasOp(call.ops, "eq", "location_id", "l1")).toBe(true);
      expect(hasOp(call.ops, "eq", "classification", "bad")).toBe(true);
      expect(hasOp(call.ops, "gte", "created_at", "2026-01-01")).toBe(true);
      expect(hasOp(call.ops, "lte", "created_at", "2026-02-01")).toBe(true);
    }
    expect(hasOp(calls[0].ops, "range", 50, 74)).toBe(true);
  });

  it("returns at least one page when there are no reviews", async () => {
    const { client } = fakeSupabase({ reviews: { data: [], count: 0 } });
    const result = await loadReviewsPage(client, { clientId: "c1", page: 1, pageSize: 25 });
    expect(result.totalPages).toBe(1);
  });

  it("throws when a query fails", async () => {
    const { client } = fakeSupabase({ reviews: { error: new Error("nope") } });
    await expect(loadReviewsPage(client, { clientId: "c1", page: 1, pageSize: 25 })).rejects.toThrow("nope");
  });
});

describe("loadClientsIndex", () => {
  it("orders by name and the latest review, limits embedded reviews to one, and maps rows", async () => {
    const { client, calls } = fakeSupabase({
      clients: {
        data: [
          {
            id: "c1",
            name: "Acme",
            slug: "acme",
            locations: [{ count: 2 }],
            profiles: [{ count: 3 }],
            reviews: [{ created_at: "2026-10-01T00:00:00Z" }],
          },
        ],
      },
    });
    const rows = await loadClientsIndex(client);
    expect(calls[0].ops).toContainEqual(["order", "created_at", { ascending: false, referencedTable: "reviews" }]);
    expect(calls[0].ops).toContainEqual(["limit", 1, { referencedTable: "reviews" }]);
    expect(rows).toEqual([
      { id: "c1", name: "Acme", slug: "acme", locationsCount: 2, usersCount: 3, lastReviewAt: "2026-10-01T00:00:00Z" },
    ]);
  });
});

describe("loadAgencyOverview", () => {
  it("pages through more than 1000 ratings", async () => {
    const page1 = Array.from({ length: 1000 }, () => ({ rating: 4 }));
    const page2 = Array.from({ length: 5 }, () => ({ rating: 2 }));
    const { client, calls } = fakeSupabase({
      clients: { data: [] },
      reviews: { data: (i: number) => (i === 0 ? page1 : page2) },
    });
    const overview = await loadAgencyOverview(client);
    expect(overview.totals.reviews30d).toBe(1005);
    expect(overview.totals.average30d).toBeCloseTo((4 * 1000 + 2 * 5) / 1005);
    const reviewCalls = calls.filter((c) => c.table === "reviews");
    expect(reviewCalls).toHaveLength(2);
    expect(hasOp(reviewCalls[0].ops, "range", 0, 999)).toBe(true);
    expect(hasOp(reviewCalls[1].ops, "range", 1000, 1999)).toBe(true);
  });
});

describe("loadOverviewData paging", () => {
  it("throws when the rating query fails", async () => {
    const { client } = fakeSupabase({
      reviews: { error: new Error("ratings down") },
      qr_scans: { count: 0 },
    });
    await expect(loadOverviewData(client, { clientId: "c1" })).rejects.toThrow("ratings down");
  });
});

describe("toClientIndexRow", () => {
  it("maps embedded counts and the latest review", () => {
    expect(
      toClientIndexRow({
        id: "c1",
        name: "Acme",
        slug: "acme",
        locations: [{ count: 2 }],
        profiles: [{ count: 3 }],
        reviews: [{ created_at: "2026-10-01T00:00:00Z" }],
      })
    ).toEqual({
      id: "c1",
      name: "Acme",
      slug: "acme",
      locationsCount: 2,
      usersCount: 3,
      lastReviewAt: "2026-10-01T00:00:00Z",
    });
  });

  it("defaults missing embeds to zero and null", () => {
    expect(toClientIndexRow({ id: "c1", name: "A", slug: "a", locations: [], profiles: [], reviews: [] })).toEqual({
      id: "c1",
      name: "A",
      slug: "a",
      locationsCount: 0,
      usersCount: 0,
      lastReviewAt: null,
    });
  });
});

describe("buildAgencyOverview", () => {
  const row = (id: string, last: string | null, locations = 1) => ({
    id,
    name: id,
    slug: id,
    locationsCount: locations,
    usersCount: 1,
    lastReviewAt: last,
  });

  it("totals clients, locations and the 30 day average", () => {
    const result = buildAgencyOverview([row("a", null, 2), row("b", null, 3)], [5, 3]);
    expect(result.totals).toEqual({ clients: 2, locations: 5, reviews30d: 2, average30d: 4 });
  });

  it("orders recent clients by latest review, clients without reviews last, max 5", () => {
    const clients = [
      row("none", null),
      row("old", "2026-01-01T00:00:00Z"),
      row("new", "2026-10-01T00:00:00Z"),
      row("c4", "2026-05-01T00:00:00Z"),
      row("c5", "2026-04-01T00:00:00Z"),
      row("c6", "2026-03-01T00:00:00Z"),
    ];
    const result = buildAgencyOverview(clients, []);
    expect(result.recentClients.map((c) => c.id)).toEqual(["new", "c4", "c5", "c6", "old"]);
    expect(result.totals.average30d).toBe(0);
  });

  it("orders by parsed timestamps, not string comparison", () => {
    const clients = [
      row("offset", "2026-10-01T05:00:00+05:00"),
      row("utc", "2026-10-01T02:00:00Z"),
    ];
    const result = buildAgencyOverview(clients, []);
    expect(result.recentClients.map((c) => c.id)).toEqual(["utc", "offset"]);
  });
});
