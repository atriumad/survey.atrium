"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildReviewUrl, generateQrDataUrl } from "@/lib/qr";
import { createLocation, deleteLocation } from "./actions";
import type { Location } from "@/lib/types";

export function LocationsSection({ locations }: { locations: Location[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Locales</h2>
      <Card>
        <CardHeader>
          <CardTitle>Agregar local</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createLocation} className="flex gap-3 flex-wrap items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-name">Nombre</Label>
              <Input id="location-name" name="name" placeholder="Sucursal Centro" required className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-slug">Slug</Label>
              <Input id="location-slug" name="slug" placeholder="centro" required className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-place-id">Google Place ID (opcional)</Label>
              <Input id="location-place-id" name="googlePlaceId" className="w-56" />
            </div>
            <Button type="submit">Agregar</Button>
          </form>
        </CardContent>
      </Card>

      {locations.length === 0 ? (
        <p className="text-sm text-body">Todavia no agregaste ningun local.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {locations.map((loc) => (
            <LocationRow key={loc.id} location={loc} />
          ))}
        </div>
      )}
    </div>
  );
}

function LocationRow({ location }: { location: Location }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const url = buildReviewUrl(baseUrl, location.slug);
    generateQrDataUrl(url).then(setQrDataUrl);
  }, [location.slug]);

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-4">
        {qrDataUrl && <img src={qrDataUrl} alt={`QR ${location.name}`} className="w-16 h-16" />}
        <div className="flex-1">
          <p className="font-medium text-ink">{location.name}</p>
          <p className="text-sm text-body">/r/{location.slug}</p>
        </div>
        {qrDataUrl && (
          <a href={qrDataUrl} download={`qr-${location.slug}.png`}>
            <Button variant="outline" size="sm">Descargar QR</Button>
          </a>
        )}
        <Button variant="ghost" size="sm" onClick={() => deleteLocation(location.id)}>
          Eliminar
        </Button>
      </CardContent>
    </Card>
  );
}
