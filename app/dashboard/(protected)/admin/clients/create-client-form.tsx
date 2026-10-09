"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClientAction } from "@/app/dashboard/(protected)/admin/actions";

export function CreateClientForm() {
  const [state, formAction, pending] = useActionState(createClientAction, null);

  return (
    <form action={formAction} className="flex gap-3 flex-wrap items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name">Name</Label>
        <Input id="client-name" name="name" placeholder="Don Chuys" required className="w-48" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-slug">Slug</Label>
        <Input id="client-slug" name="slug" placeholder="don-chuys" required className="w-48" />
      </div>
      <Button type="submit" disabled={pending}>Add client</Button>
      {state && !state.ok && (
        <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
