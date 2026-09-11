import { describe, expect, it } from "vitest";
import { reviewsToCsv } from "@/lib/csv";
import type { Review } from "@/lib/types";

describe("reviewsToCsv", () => {
  it("returns header only for empty input", () => {
    const csv = reviewsToCsv([]);
    expect(csv).toBe("date,rating,classification,comment,keywords\n");
  });

  it("formats a row with a comment and matched keywords", () => {
    const review: Review = {
      id: "1",
      client_id: "c1",
      location_id: "l1",
      rating: 2,
      comment: "muy lento",
      email: "cliente@ejemplo.com",
      classification: "bad",
      matched_keywords: ["lento"],
      shared_to_google: false,
      created_at: "2026-01-15T10:00:00.000Z",
    };
    const csv = reviewsToCsv([review]);
    expect(csv).toBe('date,rating,classification,comment,keywords\n2026-01-15,2,bad,"muy lento",lento\n');
  });

  it("escapes commas and quotes inside comments", () => {
    const review: Review = {
      id: "1",
      client_id: "c1",
      location_id: "l1",
      rating: 5,
      comment: 'Buenisimo, todo "perfecto"',
      email: null,
      classification: "good",
      matched_keywords: null,
      shared_to_google: false,
      created_at: "2026-01-15T10:00:00.000Z",
    };
    const csv = reviewsToCsv([review]);
    expect(csv).toContain('"Buenisimo, todo ""perfecto"""');
  });
});