import { z } from "zod";

export const reviewSubmitSchema = z
  .object({
    locationSlug: z.string().min(1),
    email: z.email("Invalid email address"),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000),
    sharedToGoogle: z.boolean(),
  })
  .refine((data) => data.rating > 3 || data.comment.trim().length > 0, {
    message: "Comment is required for ratings of 3 or below",
    path: ["comment"],
  });

export const locationFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/i, "Slug can only contain letters, numbers, and dashes")
    .transform((v) => v.toLowerCase()),
  googleReviewUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || /^https?:\/\//.test(v), {
      message: "Must be a Google review link (https://...) or empty",
    }),
});

export const keywordFormSchema = z.object({
  keyword: z.string().trim().min(1).max(100),
});