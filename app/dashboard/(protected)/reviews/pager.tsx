import Link from "next/link";

export function ReviewsPager({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  const linkClass =
    "rounded-[14px] px-4 py-2 text-sm font-medium border border-cool transition-colors hover:bg-muted";
  const disabledClass = "rounded-[14px] px-4 py-2 text-sm font-medium border border-cool text-body/40 cursor-not-allowed";

  return (
    <div className="flex items-center justify-between">
      {page > 1 ? (
        <Link href={buildHref(page - 1)} className={linkClass}>
          Previous
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Previous
        </span>
      )}
      <p className="text-sm text-body">
        Page {page} of {Math.max(totalPages, 1)}
      </p>
      {page < totalPages ? (
        <Link href={buildHref(page + 1)} className={linkClass}>
          Next
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Next
        </span>
      )}
    </div>
  );
}
