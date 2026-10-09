"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClientAction } from "@/app/dashboard/(protected)/admin/actions";

export function RenameClientForm({ clientId, name, slug }: { clientId: string; name: string; slug: string }) {
  const [state, formAction, pending] = useActionState(updateClientAction, null);

  return (
    <form action={formAction} className="flex gap-3 flex-wrap items-end">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name">Name</Label>
        <Input id="client-name" name="name" defaultValue={name} required className="w-56" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-slug">Slug</Label>
        <Input id="client-slug" name="slug" defaultValue={slug} required className="w-56" />
      </div>
      <Button type="submit" disabled={pending}>Save</Button>
      {state && !state.ok && <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="w-full text-sm text-body">Saved.</p>}
    </form>
  );
}
