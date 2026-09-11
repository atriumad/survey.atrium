"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildReviewUrl, generateQrDataUrl } from "@/lib/qr";
import { createLocation, deleteLocation } from "./actions";
import { GoogleLinkGuide } from "./google-link-guide";
import type { Location } from "@/lib/types";

export function LocationsSection({ locations, baseUrl }: { locations: Location[]; baseUrl: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Locations</h2>
      <Card>
        <CardHeader>
          <CardTitle>Add location</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createLocation} className="flex gap-3 flex-wrap items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-name">Name</Label>
              <Input id="location-name" name="name" placeholder="Downtown Branch" required className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-slug">Slug</Label>
              <Input id="location-slug" name="slug" placeholder="downtown" required className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-review-url">Google review link (optional)</Label>
              <Input
                id="location-review-url"
                name="googleReviewUrl"
                placeholder="https://g.page/r/XXXX/review"
                className="w-64"
              />
              <GoogleLinkGuide />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      {locations.length === 0 ? (
        <p className="text-sm text-body">You haven&apos;t added any locations yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {locations.map((loc) => (
            <LocationRow key={loc.id} location={loc} baseUrl={baseUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

function LocationRow({ location, baseUrl }: { location: Location; baseUrl: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = buildReviewUrl(baseUrl, location.slug);
    generateQrDataUrl(url).then(setQrDataUrl);
  }, [baseUrl, location.slug]);

  return (
    <Card size="sm" className="p-4">
      <CardContent className="p-0 flex items-center gap-4">
        {qrDataUrl && <img src={qrDataUrl} alt={`QR ${location.name}`} className="w-16 h-16" />}
        <div className="flex-1 flex flex-col gap-1">
          <p className="font-medium text-ink">{location.name}</p>
          <p className="text-sm text-body">/r/{location.slug}</p>
          {location.google_review_url ? (
            <p className="flex items-center gap-1.5 text-xs text-ink">
              <span className="inline-block size-1.5 rounded-full bg-green-600" aria-hidden="true" />
              Google review link configured
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-body">
              <span className="inline-block size-1.5 rounded-full bg-yellow-500" aria-hidden="true" />
              No Google review link yet
            </p>
          )}
        </div>
        {qrDataUrl && (
          <a href={qrDataUrl} download={`qr-${location.slug}.png`}>
            <Button variant="outline" size="sm">Download QR</Button>
          </a>
        )}
        <Button variant="ghost" size="sm" onClick={() => deleteLocation(location.id)}>
          Delete
        </Button>
      </CardContent>
    </Card>
  );
}
