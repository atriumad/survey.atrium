"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { buildReviewUrl, generateQrDataUrl } from "@/lib/qr";

export function LocationQr({ baseUrl, slug, name }: { baseUrl: string; slug: string; name: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = buildReviewUrl(baseUrl, slug);

  useEffect(() => {
    let cancelled = false;
    generateQrDataUrl(url).then((value) => {
      if (!cancelled) setDataUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="flex items-center gap-4">
      {dataUrl ? (
        <img src={dataUrl} alt={`QR ${name}`} className="w-16 h-16" />
      ) : (
        <div className="w-16 h-16 rounded-md bg-cool" aria-hidden="true" />
      )}
      <div className="flex flex-col gap-1">
        <p className="text-xs text-body break-all">{url}</p>
        {dataUrl && (
          <a href={dataUrl} download={`qr-${slug}.png`}>
            <Button type="button" variant="outline" size="sm">Download QR</Button>
          </a>
        )}
      </div>
    </div>
  );
}
