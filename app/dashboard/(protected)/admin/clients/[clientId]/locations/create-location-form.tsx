"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLocationAction } from "@/app/dashboard/(protected)/admin/actions";

export function CreateLocationForm({ clientId, clientSlug }: { clientId: string; clientSlug: string }) {
  const [state, formAction, pending] = useActionState(createLocationAction, null);

  return (
    <form action={formAction} className="flex gap-3 flex-wrap items-end">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loc-name">Name</Label>
        <Input id="loc-name" name="name" placeholder="Downtown Branch" required className="w-44" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loc-slug">Slug (globally unique)</Label>
        <Input id="loc-slug" name="slug" defaultValue={`${clientSlug}-`} required className="w-52" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loc-url">Google review link (optional)</Label>
        <Input id="loc-url" name="googleReviewUrl" placeholder="https://g.page/r/XXXX/review" className="w-64" />
      </div>
      <Button type="submit" disabled={pending}>Add location</Button>
      {state && !state.ok && (
        <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
