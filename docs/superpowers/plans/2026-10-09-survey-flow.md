# Survey flow (rating-first, conditional feedback, Google ask) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public survey asks only for the rating first. Ratings 1–3 reveal a required feedback field plus an "we'll respond as soon as possible" notice and end on a "we'll contact you" screen; ratings 4–5 are saved immediately and end on a screen that asks for a Google review. Reloading a final screen keeps it.

**Architecture:** `ReviewForm` (client) has two steps, email then rating; feedback is shown only for ratings 1–3. Submission still redirects to `/r/<slug>/t?c=<good|bad>&r=<reviewId>`, a server-rendered page, so a reload stays on the final screen. The final page no longer depends on a stored comment: it shows the Google ask for `c=good` (when the location has a review link) or the contact message for `c=bad`. The old "% Shared to Google" metric is kept by recording the click on the Google button through a new `mark_review_shared` RPC.

**Tech Stack:** Next.js 16 (server actions, client components), Supabase RPC, Zod 4, Vitest 5.

**Design (approved in chat 2026-10-09, bounded path, no spec file):**
- Step 1 email (unchanged). Step 2 five emoji only.
- Rating 1–3: textarea (required) + notice "We're sorry about your experience. Tell us what happened and we'll get back to you as soon as possible." Button **Send** → final: "Thank you. Our team will contact you as soon as possible."
- Rating 4–5: no textarea; **Send** saves immediately → final: "Thanks! Would you share your experience on Google?" with button **Leave a Google review** (opens the location's `google_review_url` in a new tab). No link configured → plain thank-you.
- Removed: the "Want to share on Google? Yes/No" step and the "Copy my review" button.
- `shared_to_google` is now set when the visitor clicks the Google button (not at submit).
- Out of scope: blocking repeat submissions by device, email-step changes, dashboard changes.

## Global Constraints

- Worktree `/Users/ventura/Desktop/d/atrium/survey.dcop.atrium-mt`, branch `feat/survey-flow` (from `origin/main`). Do not push.
- Server-side validation stays authoritative: comment is required for ratings ≤ 3 in `reviewSubmitSchema` and in `submit_review`; do not weaken it.
- `security definer` functions use `set search_path = ''` and `public.`-qualified names; grants: `revoke all … from public; grant execute … to anon, authenticated`.
- The existing redirect target and query params (`?c=…&r=…`) stay.
- Verification: `npx tsc --noEmit` clean, `npm test`, `npx eslint "app/r" lib tests components` (two pre-existing `<img>` warnings accepted; the intentional logo `eslint-disable` comment stays).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Ratings 4–5 never send a comment; ratings 1–3 cannot be submitted without one, and switching from a low to a high rating discards the typed text (Task 1).
- A rating change never leaves the form in a state where a stale `commentError` blocks a valid submit (Task 1).
- The final page rejects missing/invalid `c`, never shows the Google button without a configured link, and never exposes anything beyond what the visitor already knows (Task 3).
- `mark_review_shared` only flips good reviews with rating ≥ 4, is idempotent, and cannot touch other fields (Task 2).
- Reload of `/t?c=…` renders the same screen (server-rendered, no client-only state) (Task 3).

---

### Task 1: Survey flow helpers and the rating-first form

**Files:**
- Create: `lib/survey-flow.ts`
- Test: `tests/survey-flow.test.ts`
- Replace: `app/r/[locationSlug]/review-form.tsx`

**Interfaces:**
- Produces: `needsFeedback(rating: number): boolean` (true for 1, 2, 3), `isPositiveRating(rating: number): boolean` (true for 4, 5).

- [ ] **Step 1: Failing test** `tests/survey-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPositiveRating, needsFeedback } from "@/lib/survey-flow";

describe("survey flow", () => {
  it("asks for feedback on ratings 1 to 3", () => {
    for (const r of [1, 2, 3]) expect(needsFeedback(r)).toBe(true);
    for (const r of [0, 4, 5, 6, -1, NaN]) expect(needsFeedback(r)).toBe(false);
  });

  it("treats 4 and 5 as positive", () => {
    for (const r of [4, 5]) expect(isPositiveRating(r)).toBe(true);
    for (const r of [0, 1, 2, 3, 6, NaN]) expect(isPositiveRating(r)).toBe(false);
  });
});
```

Run `npx vitest run tests/survey-flow.test.ts` → FAIL (module missing).

- [ ] **Step 2: `lib/survey-flow.ts`**

```ts
// Ratings 1-3 (angry, unhappy, neutral) get a feedback field and a follow-up;
// ratings 4-5 (happy, loved it) are asked for a Google review instead.
export function needsFeedback(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 3;
}

export function isPositiveRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 4 && rating <= 5;
}
```

- [ ] **Step 3: Replace `app/r/[locationSlug]/review-form.tsx`** with:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { RATING_EMOJI, RATING_LABEL } from "@/components/ui/rating-emoji";
import { needsFeedback } from "@/lib/survey-flow";
import { submitReview } from "./actions";

const STEPS = ["Email", "Your rating"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ReviewForm({ locationSlug }: { locationSlug: string }) {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const feedbackRequired = needsFeedback(rating);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (step === 0) handleEmailNext();
    else handleRatingSubmit();
  }

  function handleEmailNext() {
    const value = email.trim().toLowerCase();
    if (!value) {
      setEmailError("Enter your email address.");
      return;
    }
    if (!EMAIL_RE.test(value)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    setStep(1);
  }

  function selectRating(value: number) {
    setRating(value);
    setSubmitError(null);
    if (!needsFeedback(value)) {
      // Happy ratings do not collect a comment: drop anything typed before.
      setComment("");
      setCommentError(null);
    }
  }

  function handleRatingSubmit() {
    if (rating === 0) return;
    if (feedbackRequired && comment.trim().length === 0) {
      setCommentError("Tell us what happened so we can follow up.");
      return;
    }
    setCommentError(null);
    void submit();
  }

  async function submit() {
    setPending(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.set("locationSlug", locationSlug);
      formData.set("email", email.trim().toLowerCase());
      formData.set("rating", String(rating));
      formData.set("comment", feedbackRequired ? comment : "");
      formData.set("sharedToGoogle", "false");
      await submitReview(formData);
    } catch (err) {
      unstable_rethrow(err);
      setSubmitError(err instanceof Error ? err.message : "We couldn't save your review.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-[26px] bg-white p-6 border border-cool"
    >
      <div className="flex items-center justify-center gap-1" aria-label="Progress">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-1">
            {i > 0 && (
              <div className={cn("h-px w-6", i <= step ? "bg-amber" : "bg-ink/15")} />
            )}
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                i === step
                  ? "bg-ink text-cream"
                  : i < step
                    ? "bg-amber text-ink"
                    : "border border-ink/15 text-body/60"
              )}
            >
              {i < step ? "✓" : i + 1}
            </span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              className="h-11"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              aria-invalid={emailError ? true : undefined}
            />
            {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          </div>
          <Button type="submit" size="lg" className="h-11 rounded-[18px]">
            Continue
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-5">
          <div className="flex gap-2 justify-center" role="radiogroup" aria-label="Rating">
            {([1, 2, 3, 4, 5] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-label={RATING_LABEL[value]}
                aria-pressed={rating === value}
                onClick={() => selectRating(value)}
                className={cn(
                  "text-4xl transition-all grayscale opacity-40 hover:opacity-100 hover:grayscale-0",
                  rating === value && "opacity-100 grayscale-0 scale-125"
                )}
              >
                {RATING_EMOJI[value]}
              </button>
            ))}
          </div>

          <div aria-live="polite">
            {feedbackRequired && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-body text-center">
                  We&apos;re sorry about your experience. Tell us what happened and we&apos;ll get
                  back to you as soon as possible.
                </p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="comment">What happened? (required)</Label>
                  <Textarea
                    id="comment"
                    name="comment"
                    placeholder="Tell us what happened so we can make it right"
                    className="min-h-28"
                    value={comment}
                    onChange={(e) => {
                      setComment(e.target.value);
                      if (commentError) setCommentError(null);
                    }}
                    aria-invalid={commentError ? true : undefined}
                  />
                  {commentError && <p className="text-sm text-destructive">{commentError}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 rounded-[18px]"
              onClick={() => setStep(0)}
              disabled={pending}
            >
              Back
            </Button>
            <Button
              type="submit"
              size="lg"
              className="h-11 flex-1 rounded-[18px]"
              disabled={rating === 0 || pending}
            >
              {pending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      )}

      {submitError && <p className="text-sm text-destructive text-center">{submitError}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Verify:** `npx vitest run tests/survey-flow.test.ts && npx tsc --noEmit && npm test && npx eslint "app/r" lib tests`. Expected clean. (No browser available; say so.)

- [ ] **Step 5: Commit**

```bash
git add lib/survey-flow.ts tests/survey-flow.test.ts "app/r/[locationSlug]/review-form.tsx"
git commit -m "feat: rating-first survey form with feedback only for ratings 1-3

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Record the Google click (RPC, rate limit, server action)

**Files:**
- Create: `supabase/migrations/0014_mark_review_shared.sql`
- Modify: `lib/rate-limit.ts` (new action key + policy)
- Modify: `app/r/[locationSlug]/actions.ts` (append `markSharedToGoogle`)
- Test: `tests/survey-actions.test.ts`

**Interfaces:**
- Produces: SQL `public.mark_review_shared(p_review_id uuid) returns void`; `RateLimitAction` gains `"share-click"`; `SHARE_CLICK_POLICY = { maxAttempts: 5, windowSeconds: 60 }`; `markSharedToGoogle(reviewId: string): Promise<void>` server action (never throws to the caller).

- [ ] **Step 1: Migration** `supabase/migrations/0014_mark_review_shared.sql`:

```sql
-- 0014: Record that a visitor clicked "Leave a Google review".
--
-- The survey used to set shared_to_google at submit time (the visitor answered
-- "yes, share"). That question is gone: the Google ask now happens on the final
-- screen, so the flag is set when the visitor clicks the Google button.
-- Only good (rating >= 4) reviews can be flagged; nothing else is writable.

create or replace function public.mark_review_shared(p_review_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reviews
  set shared_to_google = true
  where id = p_review_id
    and classification = 'good'
    and rating >= 4
    and shared_to_google = false;
$$;

revoke all on function public.mark_review_shared(uuid) from public;
grant execute on function public.mark_review_shared(uuid) to anon, authenticated;
```

(Not executed here: no database. Say so in the report.)

- [ ] **Step 2: Failing test** `tests/survey-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.7" })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { markSharedToGoogle } from "@/app/r/[locationSlug]/actions";

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";

function fakeSupabase(opts: { allowed?: boolean; shareError?: boolean } = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    calls.push({ fn, args });
    if (fn === "consume_rate_limit") return { data: opts.allowed ?? true, error: null };
    if (fn === "mark_review_shared") return { data: null, error: opts.shareError ? { message: "x" } : null };
    return { data: null, error: null };
  });
  vi.mocked(createClient).mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof createClient>>);
  return { calls };
}

describe("markSharedToGoogle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flags the review after passing the rate limit", async () => {
    const { calls } = fakeSupabase();
    await markSharedToGoogle(REVIEW_ID);
    expect(calls.map((c) => c.fn)).toEqual(["consume_rate_limit", "mark_review_shared"]);
    expect(calls[0].args).toMatchObject({ p_key: "share-click:203.0.113.7" });
    expect(calls[1].args).toEqual({ p_review_id: REVIEW_ID });
  });

  it("ignores an invalid review id without calling the database", async () => {
    fakeSupabase();
    await markSharedToGoogle("not-a-uuid");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does nothing when rate limited", async () => {
    const { calls } = fakeSupabase({ allowed: false });
    await markSharedToGoogle(REVIEW_ID);
    expect(calls.map((c) => c.fn)).toEqual(["consume_rate_limit"]);
  });

  it("never throws when the database call fails", async () => {
    fakeSupabase({ shareError: true });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(markSharedToGoogle(REVIEW_ID)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

Run `npx vitest run tests/survey-actions.test.ts` → FAIL (missing export).

- [ ] **Step 3: Rate limit.** In `lib/rate-limit.ts` change `RateLimitAction` to `"submit-review" | "login" | "share-click"` and add:

```ts
export const SHARE_CLICK_POLICY: RateLimitPolicy = {
  maxAttempts: 5,
  windowSeconds: 60,
};
```

- [ ] **Step 4: Action.** In `app/r/[locationSlug]/actions.ts` add `import { z } from "zod";`, import `SHARE_CLICK_POLICY` with the other rate-limit imports, and append:

```ts
// Called when the visitor clicks "Leave a Google review". Best effort: it must
// never block the link or surface an error to the visitor.
export async function markSharedToGoogle(reviewId: string): Promise<void> {
  if (!z.uuid().safeParse(reviewId).success) return;

  const headersList = await headers();
  const supabase = await createClient();
  const allowed = await consumeRateLimit(
    supabase,
    buildRateLimitKey(getRequestIp(headersList), "share-click"),
    SHARE_CLICK_POLICY
  );
  if (!allowed) return;

  const { error } = await supabase.rpc("mark_review_shared", { p_review_id: reviewId });
  if (error) console.error("mark_review_shared failed", error);
}
```

- [ ] **Step 5: Verify:** `npx vitest run tests/survey-actions.test.ts && npx tsc --noEmit && npm test && npx eslint "app/r" lib tests`. Expected clean. The existing `rate-limit` tests must still pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0014_mark_review_shared.sql lib/rate-limit.ts "app/r/[locationSlug]/actions.ts" tests/survey-actions.test.ts
git commit -m "feat: record the Google review click as shared_to_google

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Final screens (Google ask / contact message)

**Files:**
- Replace: `app/r/[locationSlug]/t/page.tsx`
- Create: `app/r/[locationSlug]/t/google-ask.tsx`
- Delete: `app/r/[locationSlug]/t/share-google.tsx`

**Interfaces:**
- Consumes: `markSharedToGoogle` (Task 2), `get_public_location` RPC (returns `google_review_url`).

- [ ] **Step 1: `t/google-ask.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { markSharedToGoogle } from "../actions";

export function GoogleAsk({ reviewId, reviewUrl }: { reviewId: string | null; reviewUrl: string }) {
  return (
    <div className="flex flex-col gap-4 items-center text-center max-w-sm">
      <p className="text-body text-lg">
        Would you share your experience on Google? It only takes a minute and helps us a lot.
      </p>
      <Button
        size="lg"
        className="h-11 rounded-[18px]"
        nativeButton={false}
        render={
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (reviewId) void markSharedToGoogle(reviewId);
            }}
          />
        }
      >
        Leave a Google review
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Replace `t/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { GoogleAsk } from "./google-ask";

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationSlug: string }>;
  searchParams: Promise<{ c?: string; r?: string }>;
}) {
  const { locationSlug } = await params;
  const { c, r } = await searchParams;

  // Not a real submission result: send the visitor back to the form.
  if (c !== "good" && c !== "bad") redirect(`/r/${locationSlug}`);

  if (c === "bad") {
    return (
      <Shell title="Thank you">
        <p className="text-body text-center text-lg max-w-sm">
          We&apos;re sorry about your experience. Someone from our team will contact you as soon
          as possible.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const { data: location } = await supabase
    .rpc("get_public_location", { p_slug: locationSlug })
    .maybeSingle<{ google_review_url: string | null }>();
  const reviewUrl = location?.google_review_url ?? null;
  const reviewId = z.uuid().safeParse(r).success ? (r as string) : null;

  return (
    <Shell title="Thanks for your feedback!">
      {reviewUrl ? (
        <GoogleAsk reviewId={reviewId} reviewUrl={reviewUrl} />
      ) : (
        <p className="text-body text-center text-lg max-w-sm">
          We&apos;re glad you enjoyed your visit. See you soon!
        </p>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-cream">
      <h1 className="text-2xl font-medium text-ink tracking-tight text-center">{title}</h1>
      {children}
    </main>
  );
}
```

- [ ] **Step 3:** `git rm "app/r/[locationSlug]/t/share-google.tsx"`; `grep -rn "share-google\|get_review_share_comment\|Copy my review" app lib components` must show no code reference (the RPC may remain in old migrations).

- [ ] **Step 4: Verify:** `npx tsc --noEmit && npm test && npx eslint "app/r" lib tests && npx next build --webpack`. Expected clean (if the build cannot run for environmental reasons, report the exact error).

- [ ] **Step 5: Commit**

```bash
git add -A "app/r/[locationSlug]/t"
git commit -m "feat: final screens - Google review ask for good ratings, contact message otherwise

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
