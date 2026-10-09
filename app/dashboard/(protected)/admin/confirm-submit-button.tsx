"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmSubmitButton({
  confirmMessage,
  ariaLabel,
  children,
}: {
  confirmMessage: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      aria-label={ariaLabel}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
