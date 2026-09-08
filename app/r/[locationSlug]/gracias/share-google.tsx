"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareGoogle({ googlePlaceId, comment }: { googlePlaceId: string; comment: string }) {
  const [copied, setCopied] = useState(false);
  const reviewUrl = `https://search.google.com/local/writereview?placeid=${googlePlaceId}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(comment);
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-3 items-center">
      <p className="text-center text-muted-foreground">
        Te gustaria compartir tu opinion en Google?
      </p>
      <div className="flex gap-2">
        {comment && (
          <Button variant="outline" onClick={handleCopy}>
            {copied ? "Copiado!" : "Copiar mi review"}
          </Button>
        )}
        <Button render={<a href={reviewUrl} target="_blank" rel="noopener noreferrer" />}>
          Abrir Google
        </Button>
      </div>
    </div>
  );
}
