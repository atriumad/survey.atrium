import { describe, expect, it } from "vitest";
import { isPositiveRating, needsFeedback } from "@/lib/survey-flow";

describe("survey flow", () => {
  it("asks for feedback on ratings 1 to 3", () => {
    for (const r of [1, 2, 3]) expect(needsFeedback(r)).toBe(true);
    for (const r of [0, 4, 5, 6, -1, NaN]) expect(needsFeedback(r)).toBe(false);
  });

  it("treats 4 and 5 as positive", () => {
    for (const r of [4, 5]) expect(isPositiveRating(r)).toBe(true);
    for (const r of [0, 1, 2, 3, 6, NaN]) expect(isPositiveRating(r)).toBe(false);
  });
});
