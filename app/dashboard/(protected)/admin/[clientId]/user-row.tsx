"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { CredentialsNotice } from "../credentials-notice";
import { deleteUserAction, resetPasswordAction } from "../actions";

export function UserRow({
  user,
}: {
  user: { id: string; email: string; role: string; locationName: string | null };
}) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);

  return (
    <Card size="sm" className="p-4">
      <CardContent className="p-0 flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="font-medium text-ink">{user.email}</p>
            <p className="text-sm text-body capitalize">
              {user.role}
              {user.locationName ? ` · ${user.locationName}` : ""}
            </p>
          </div>
          <form action={formAction}>
            <input type="hidden" name="userId" value={user.id} />
            <Button type="submit" variant="outline" size="sm" disabled={pending}>Reset password</Button>
          </form>
          <form action={deleteUserAction}>
            <input type="hidden" name="userId" value={user.id} />
            <ConfirmSubmitButton
              confirmMessage={`Delete user ${user.email}? They will no longer be able to log in. This cannot be undone.`}
              ariaLabel={`Delete ${user.email}`}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
        {state && !state.ok && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        {state?.ok && <CredentialsNotice email={user.email} password={state.data.password} />}
      </CardContent>
    </Card>
  );
}
