import { describe, expect, it } from "vitest";
import { reviewSubmitSchema } from "@/lib/validation";

describe("reviewSubmitSchema", () => {
  it("accepts a valid high-rating submission without a comment", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 5,
      comment: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects rating outside 1-5", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 6,
      comment: "",
    });
    expect(result.success).toBe(false);
  });

  it("requires a comment when rating is 3 or below", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 2,
      comment: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts rating 3 or below with a comment present", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 2,
      comment: "El servicio fue lento",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a comment longer than 1000 characters", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 5,
      comment: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});
