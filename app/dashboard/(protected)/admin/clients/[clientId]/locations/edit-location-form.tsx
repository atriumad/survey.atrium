"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLocationAction } from "@/app/dashboard/(protected)/admin/actions";

export function EditLocationForm({
  locationId,
  name,
  googleReviewUrl,
}: {
  locationId: string;
  name: string;
  googleReviewUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateLocationAction, null);

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-body hover:text-ink">Edit</summary>
      <form action={formAction} className="mt-3 flex gap-3 flex-wrap items-end">
        <input type="hidden" name="locationId" value={locationId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${locationId}`}>Name</Label>
          <Input id={`name-${locationId}`} name="name" defaultValue={name} required className="w-48" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`url-${locationId}`}>Google review link</Label>
          <Input
            id={`url-${locationId}`}
            name="googleReviewUrl"
            defaultValue={googleReviewUrl ?? ""}
            placeholder="https://g.page/r/XXXX/review"
            className="w-64"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>Save</Button>
        {state && !state.ok && <p role="alert" className="w-full text-red-600">{state.error}</p>}
        {state?.ok && <p role="status" className="w-full text-body">Saved.</p>}
      </form>
    </details>
  );
}
