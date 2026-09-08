import { z } from "zod";

export const reviewSubmitSchema = z
  .object({
    locationSlug: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000),
  })
  .refine((data) => data.rating > 3 || data.comment.trim().length > 0, {
    message: "Comment is required for ratings of 3 or below",
    path: ["comment"],
  });
