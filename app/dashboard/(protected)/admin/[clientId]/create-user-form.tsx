"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CredentialsNotice } from "../credentials-notice";
import { createUserAction } from "../actions";

export function CreateUserForm({
  clientId,
  locations,
}: {
  clientId: string;
  locations: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createUserAction, null);
  const selectClass = "h-9 rounded-[14px] border border-cool bg-white px-3 text-sm text-ink";

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex gap-3 flex-wrap items-end">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-email">Email</Label>
          <Input id="user-email" name="email" type="email" placeholder="owner@client.com" required className="w-64" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-role">Role</Label>
          <select id="user-role" name="role" defaultValue="admin" className={selectClass}>
            <option value="admin">Admin (all locations)</option>
            <option value="manager">Manager (one location)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-location">Location (managers only)</Label>
          <select id="user-location" name="locationId" defaultValue="" className={selectClass}>
            <option value="">-</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>Create user</Button>
      </form>
      {state && !state.ok && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <CredentialsNotice email={state.data.email} password={state.data.password} />}
    </div>
  );
}
