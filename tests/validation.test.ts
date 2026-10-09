import { describe, expect, it } from "vitest";
import {
  clientDeleteSchema,
  clientFormSchema,
  clientUpdateSchema,
  locationUpdateSchema,
  reviewSubmitSchema,
  userFormSchema,
} from "@/lib/validation";

const validBase = {
  locationSlug: "downtown",
  email: "cliente@ejemplo.com",
  sharedToGoogle: false,
};

describe("reviewSubmitSchema", () => {
  it("accepts a valid high-rating submission without a comment", () => {
    const result = reviewSubmitSchema.safeParse({
      ...validBase,
      rating: 5,
      comment: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects rating outside 1-5", () => {
    const result = reviewSubmitSchema.safeParse({
      ...validBase,
      rating: 6,
      comment: "",
    });
    expect(result.success).toBe(false);
  });

  it("requires a comment when rating is 3 or below", () => {
    const result = reviewSubmitSchema.safeParse({
      ...validBase,
      rating: 2,
      comment: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts rating 3 or below with a comment present", () => {
    const result = reviewSubmitSchema.safeParse({
      ...validBase,
      rating: 2,
      comment: "El servicio fue lento",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a comment longer than 1000 characters", () => {
    const result = reviewSubmitSchema.safeParse({
      ...validBase,
      rating: 5,
      comment: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email", () => {
    const result = reviewSubmitSchema.safeParse({
      locationSlug: "downtown",
      rating: 5,
      comment: "",
      sharedToGoogle: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = reviewSubmitSchema.safeParse({
      ...validBase,
      email: "no-es-un-email",
      rating: 5,
      comment: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid submission opting to share on Google", () => {
    const result = reviewSubmitSchema.safeParse({
      ...validBase,
      rating: 5,
      comment: "",
      sharedToGoogle: true,
    });
    expect(result.success).toBe(true);
  });
});
describe("clientFormSchema", () => {
  it("lowercases the slug", () => {
    const r = clientFormSchema.parse({ name: " Don Chuys ", slug: "Don-Chuys" });
    expect(r).toEqual({ name: "Don Chuys", slug: "don-chuys" });
  });

  it("rejects slugs with spaces", () => {
    expect(clientFormSchema.safeParse({ name: "X", slug: "bad slug" }).success).toBe(false);
  });
});

describe("userFormSchema", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  const locationId = "22222222-2222-4222-8222-222222222222";

  it("accepts an admin without a location", () => {
    const r = userFormSchema.parse({ clientId, email: "A@B.com", role: "admin", locationId: "" });
    expect(r.email).toBe("a@b.com");
    expect(r.locationId).toBeNull();
  });

  it("requires a location for managers", () => {
    expect(userFormSchema.safeParse({ clientId, email: "a@b.com", role: "manager", locationId: "" }).success).toBe(false);
  });

  it("accepts a manager with a location", () => {
    expect(userFormSchema.safeParse({ clientId, email: "a@b.com", role: "manager", locationId }).success).toBe(true);
  });

  it("rejects the superadmin role", () => {
    expect(userFormSchema.safeParse({ clientId, email: "a@b.com", role: "superadmin", locationId: "" }).success).toBe(false);
  });
});

describe("clientUpdateSchema", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  it("normalizes the slug", () => {
    expect(clientUpdateSchema.parse({ clientId, name: " Acme ", slug: "ACME-Co" })).toEqual({
      clientId,
      name: "Acme",
      slug: "acme-co",
    });
  });
  it("rejects a non-uuid client id", () => {
    expect(clientUpdateSchema.safeParse({ clientId: "x", name: "A", slug: "a" }).success).toBe(false);
  });
});

describe("locationUpdateSchema", () => {
  const locationId = "22222222-2222-4222-8222-222222222222";
  it("accepts name and review link, and strips any slug", () => {
    const parsed = locationUpdateSchema.parse({
      locationId,
      name: "Centro",
      googleReviewUrl: "https://g.page/r/X/review",
      slug: "hacked",
    });
    expect(parsed).toEqual({ locationId, name: "Centro", googleReviewUrl: "https://g.page/r/X/review" });
    expect("slug" in parsed).toBe(false);
  });
  it("turns an empty review link into null", () => {
    expect(locationUpdateSchema.parse({ locationId, name: "Centro", googleReviewUrl: "" }).googleReviewUrl).toBeNull();
  });
});

describe("clientDeleteSchema", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  it("lowercases and trims the confirmation slug", () => {
    expect(clientDeleteSchema.parse({ clientId, confirmSlug: "  Acme " }).confirmSlug).toBe("acme");
  });
});
