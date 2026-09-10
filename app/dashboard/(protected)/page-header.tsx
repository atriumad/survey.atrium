import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-medium text-ink tracking-tight">{title}</h1>
        {description && <p className="text-sm text-body mt-1">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
