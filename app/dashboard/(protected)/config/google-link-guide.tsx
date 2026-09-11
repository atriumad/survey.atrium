"use client";

import { useState } from "react";

const GOOGLE_GUIDE_URL = "https://support.google.com/business/answer/16816815";

export function GoogleLinkGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
        aria-expanded={open}
      >
        {open ? "Hide how to get the link" : "How do I get the review link?"}
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-[18px] bg-muted/60 p-4 text-sm text-body">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Go to <span className="font-medium text-ink">business.google.com</span> with the Google
              account that <span className="font-medium text-ink">owns the business profile</span>.
            </li>
            <li>
              Make sure the profile is <span className="font-medium text-ink">verified</span>. If you
              don&apos;t see the option below, that&apos;s why.
            </li>
            <li>
              In the business panel, click{" "}
              <span className="font-medium text-ink">&quot;Ask for reviews&quot;</span> (sometimes shown
              as <span className="font-medium text-ink">&quot;Get more reviews&quot;</span>).
            </li>
            <li>
              Click <span className="font-medium text-ink">&quot;Copy&quot;</span>. The link looks like
              this: <code className="rounded bg-background px-1.5 py-0.5 text-xs">https://g.page/r/XXXX/review</code>
            </li>
            <li>
              Paste it into the <span className="font-medium text-ink">Google review link</span> field
              and save the location.
            </li>
          </ol>
          <ul className="space-y-1.5 pl-5 text-sm list-disc">
            <li>
              The link is <span className="font-medium text-ink">permanent</span> as long as the profile
              exists: it opens the review form directly.
            </li>
            <li>
              Try opening it on your phone: it should land on &quot;Write a review&quot;, not the general
              business listing.
            </li>
            <li>
              That same screen also lets you download a{" "}
              <span className="font-medium text-ink">QR code</span> if you want to print it in-store.
            </li>
          </ul>
          <a
            href={GOOGLE_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
          >
            See Google&apos;s official guide →
          </a>
        </div>
      )}
    </div>
  );
}
