"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  removeClientLogoAction,
  uploadClientLogoAction,
} from "@/app/dashboard/(protected)/admin/actions";

export function LogoCard({
  clientId,
  logoUrl,
  clientName,
}: {
  clientId: string;
  logoUrl: string | null;
  clientName: string;
}) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadClientLogoAction, null);
  const [removeState, removeAction, removing] = useActionState(removeClientLogoAction, null);
  const shownUrl = logoUrl;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shownUrl} alt={`${clientName} logo`} className="max-h-16 w-auto object-contain" />
        ) : (
          <p className="text-sm text-body">No logo yet. The survey page will show only the names.</p>
        )}
      </div>

      <form action={uploadAction} className="flex gap-3 flex-wrap items-end">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logo-file">Logo (PNG, JPG or WebP, up to 2 MB)</Label>
          <Input id="logo-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
        </div>
        <Button type="submit" disabled={uploading}>Upload</Button>
      </form>
      {uploadState && !uploadState.ok && <p role="alert" className="text-sm text-red-600">{uploadState.error}</p>}
      {uploadState?.ok && logoUrl && <p role="status" className="text-sm text-body">Logo updated.</p>}

      {shownUrl && (
        <form action={removeAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <Button type="submit" variant="outline" size="sm" disabled={removing}>Remove logo</Button>
        </form>
      )}
      {removeState && !removeState.ok && <p role="alert" className="text-sm text-red-600">{removeState.error}</p>}
    </div>
  );
}
