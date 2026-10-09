"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteClientAction } from "@/app/dashboard/(protected)/admin/actions";

export function DeleteClientForm({ clientId, slug }: { clientId: string; slug: string }) {
  const [state, formAction, pending] = useActionState(deleteClientAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-sm text-body">
        This permanently deletes the client, its locations, reviews, scans and every user login. To confirm, type{" "}
        <span className="font-mono text-ink">{slug}</span>.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`confirm-slug-${clientId}`}>Client slug</Label>
        <Input id={`confirm-slug-${clientId}`} name="confirmSlug" autoComplete="off" required />
      </div>
      <div>
        <Button type="submit" variant="destructive" disabled={pending}>Delete client</Button>
      </div>
      {state && !state.ok && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
