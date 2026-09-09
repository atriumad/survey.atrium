"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildReviewUrl, generateQrDataUrl } from "@/lib/qr";
import { createLocation, deleteLocation } from "./actions";
import type { Location } from "@/lib/types";

export function LocationsSection({ locations }: { locations: Location[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Locales</h2>
      <form action={createLocation} className="flex gap-2 flex-wrap items-end">
        <Input name="name" placeholder="Nombre" required className="w-40" />
        <Input name="slug" placeholder="slug (ej: centro)" required className="w-40" />
        <Input name="googlePlaceId" placeholder="Google Place ID (opcional)" className="w-56" />
        <Button type="submit">Agregar</Button>
      </form>
      <div className="flex flex-col gap-2">
        {locations.map((loc) => (
          <LocationRow key={loc.id} location={loc} />
        ))}
      </div>
    </div>
  );
}

function LocationRow({ location }: { location: Location }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const url = buildReviewUrl(baseUrl, location.slug);
    generateQrDataUrl(url).then(setQrDataUrl);
  }, [location.slug]);

  return (
    <div className="flex items-center gap-4 border rounded-lg p-3">
      {qrDataUrl && <img src={qrDataUrl} alt={`QR ${location.name}`} className="w-16 h-16" />}
      <div className="flex-1">
        <p className="font-medium">{location.name}</p>
        <p className="text-sm text-muted-foreground">/r/{location.slug}</p>
      </div>
      {qrDataUrl && (
        <a href={qrDataUrl} download={`qr-${location.slug}.png`}>
          <Button variant="outline" size="sm">Descargar QR</Button>
        </a>
      )}
      <Button variant="ghost" size="sm" onClick={() => deleteLocation(location.id)}>
        Eliminar
      </Button>
    </div>
  );
}