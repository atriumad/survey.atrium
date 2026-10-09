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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 0 = email, 1 = rating (emojis only), 2 = feedback (ratings 1-3 only)
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
  const stepCount = feedbackRequired ? 3 : 2;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (step === 0) handleEmailNext();
    else if (step === 1) handleRatingContinue();
    else handleFeedbackSend();
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

  function handleRatingContinue() {
    if (rating === 0) return;
    if (feedbackRequired) {
      setStep(2);
      return;
    }
    // Ratings 4-5 are saved now and land on the "share on Google?" screen.
    void submit();
  }

  function handleFeedbackSend() {
    if (comment.trim().length === 0) {
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
      setPending(false);
    }
  }

  const labels = feedbackRequired ? ["Email", "Rating", "Feedback"] : ["Email", "Rating"];

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-[26px] bg-white p-6 border border-cool"
    >
      <div className="flex items-center justify-center gap-1" aria-label="Progress">
        {labels.slice(0, stepCount).map((label, i) => (
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
                disabled={pending}
                className={cn(
                  "text-4xl transition-all grayscale opacity-40 hover:opacity-100 hover:grayscale-0",
                  rating === value && "opacity-100 grayscale-0 scale-125"
                )}
              >
                {RATING_EMOJI[value]}
              </button>
            ))}
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
              {pending ? "Sending..." : "Continue"}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-body text-center">
            We&apos;re sorry about your experience. Tell us what happened and we&apos;ll get back
            to you as soon as possible.
          </p>
          <div className="flex flex-col gap-2" aria-live="polite">
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
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 rounded-[18px]"
              onClick={() => setStep(1)}
              disabled={pending}
            >
              Back
            </Button>
            <Button type="submit" size="lg" className="h-11 flex-1 rounded-[18px]" disabled={pending}>
              {pending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      )}

      {submitError && <p className="text-sm text-destructive text-center">{submitError}</p>}
    </form>
  );
}
