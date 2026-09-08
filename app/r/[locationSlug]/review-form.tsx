"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "./actions";

export function ReviewForm({ locationSlug }: { locationSlug: string }) {
  const [rating, setRating] = useState(0);
  const [pending, setPending] = useState(false);
  const commentRequired = rating > 0 && rating <= 3;

  return (
    <form
      action={async (formData) => {
        setPending(true);
        await submitReview(formData);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="locationSlug" value={locationSlug} />
      <input type="hidden" name="rating" value={rating} />

      <div className="flex gap-2 justify-center" role="radiogroup" aria-label="Calificacion">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} estrellas`}
            aria-pressed={rating === star}
            onClick={() => setRating(star)}
            className={`text-4xl transition-colors ${star <= rating ? "text-yellow-400" : "text-muted-foreground"}`}
          >
            ★
          </button>
        ))}
      </div>

      <Textarea
        name="comment"
        placeholder={commentRequired ? "Contanos que paso (requerido)" : "Contanos tu experiencia (opcional)"}
        required={commentRequired}
      />

      <Button type="submit" disabled={rating === 0 || pending}>
        {pending ? "Enviando..." : "Enviar"}
      </Button>
    </form>
  );
}
