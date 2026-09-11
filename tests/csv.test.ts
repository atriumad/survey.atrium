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

  it("prefixes formula-injection comments with a single quote", () => {
    const review: Review = {
      id: "1",
      client_id: "c1",
      location_id: "l1",
      rating: 1,
      comment: "=SUM(A1:A2)",
      email: null,
      classification: "bad",
      matched_keywords: null,
      shared_to_google: false,
      created_at: "2026-01-15T10:00:00.000Z",
    };
    const csv = reviewsToCsv([review]);
    expect(csv).toContain("'=SUM(A1:A2)");
  });

  it.each([
    ["+cmd|'|C:/Windows/System32/cmd.exe", "'+cmd|'|C:/Windows/System32/cmd.exe"],
    ["@user", "'@user"],
    ["-2+3+cmd", "'-2+3+cmd"],
    ["\tmalicious", "'\tmalicious"],
  ])("neutralizes leading %s in comments", (comment, expected) => {
    const review: Review = {
      id: "1",
      client_id: "c1",
      location_id: "l1",
      rating: 1,
      comment,
      email: null,
      classification: "bad",
      matched_keywords: null,
      shared_to_google: false,
      created_at: "2026-01-15T10:00:00.000Z",
    };
    const csv = reviewsToCsv([review]);
    expect(csv).toContain(expected);
  });

  it("neutralizes formula injection in keywords", () => {
    const review: Review = {
      id: "1",
      client_id: "c1",
      location_id: "l1",
      rating: 2,
      comment: "lento",
      email: null,
      classification: "bad",
      matched_keywords: ["=2+2", "rapido"],
      shared_to_google: false,
      created_at: "2026-01-15T10:00:00.000Z",
    };
    const csv = reviewsToCsv([review]);
    expect(csv).toContain("'=2+2;rapido");
  });

  it("leaves a plain comment without quotes when it contains no delimiters", () => {
    const review: Review = {
      id: "1",
      client_id: "c1",
      location_id: "l1",
      rating: 5,
      comment: "excelente",
      email: null,
      classification: "good",
      matched_keywords: null,
      shared_to_google: false,
      created_at: "2026-01-15T10:00:00.000Z",
    };
    const csv = reviewsToCsv([review]);
    expect(csv).toContain(",excelente,");
  });
});