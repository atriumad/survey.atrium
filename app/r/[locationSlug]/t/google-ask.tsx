"use client";

import { Button } from "@/components/ui/button";
import { markSharedToGoogle } from "../actions";

export function GoogleAsk({ reviewId, reviewUrl }: { reviewId: string | null; reviewUrl: string }) {
  return (
    <div className="flex flex-col gap-4 items-center text-center max-w-sm">
      <p className="text-body text-lg">
        Would you share your experience on Google? It only takes a minute and helps us a lot.
      </p>
      <Button
        size="lg"
        className="h-11 rounded-[18px]"
        nativeButton={false}
        render={
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (reviewId) void markSharedToGoogle(reviewId);
            }}
          />
        }
      >
        Leave a Google review
      </Button>
    </div>
  );
}
