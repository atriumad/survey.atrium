"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareGoogle({ reviewUrl, comment }: { reviewUrl: string; comment: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(comment);
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-3 items-center">
      <p className="text-center text-muted-foreground">
        Want to share your review on Google?
      </p>
      <div className="flex gap-2">
        {comment && (
          <Button variant="outline" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy my review"}
          </Button>
        )}
        <Button
          nativeButton={false}
          render={<a href={reviewUrl} target="_blank" rel="noopener noreferrer" />}
        >
          Open Google
        </Button>
      </div>
    </div>
  );
}
