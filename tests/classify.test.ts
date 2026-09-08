import { describe, expect, it } from "vitest";
import { classifyReview } from "@/lib/classify";

describe("classifyReview", () => {
  it("classifies 5 stars with no comment as good", () => {
    const result = classifyReview({ rating: 5, comment: "", negativeKeywords: ["lento", "sucio"] });
    expect(result).toEqual({ classification: "good", matchedKeywords: [] });
  });

  it("classifies 4 stars with a clean comment as good", () => {
    const result = classifyReview({
      rating: 4,
      comment: "Muy buena atencion",
      negativeKeywords: ["lento", "sucio"],
    });
    expect(result).toEqual({ classification: "good", matchedKeywords: [] });
  });

  it("classifies 3 stars as bad regardless of comment", () => {
    const result = classifyReview({ rating: 3, comment: "todo bien", negativeKeywords: [] });
    expect(result.classification).toBe("bad");
  });

  it("classifies 5 stars as bad when comment matches a negative keyword", () => {
    const result = classifyReview({
      rating: 5,
      comment: "El local estaba muy sucio",
      negativeKeywords: ["lento", "sucio"],
    });
    expect(result).toEqual({ classification: "bad", matchedKeywords: ["sucio"] });
  });

  it("keyword match is case-insensitive", () => {
    const result = classifyReview({
      rating: 5,
      comment: "Todo SUCIO y mal",
      negativeKeywords: ["sucio"],
    });
    expect(result.matchedKeywords).toEqual(["sucio"]);
  });

  it("collects all matched keywords, not just the first", () => {
    const result = classifyReview({
      rating: 5,
      comment: "lento y sucio",
      negativeKeywords: ["lento", "sucio", "caro"],
    });
    expect(result.matchedKeywords.sort()).toEqual(["lento", "sucio"]);
  });
});
