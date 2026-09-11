"use client";

import { FormEvent, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { submitReview } from "./actions";

const STEPS = ["Email", "Your feedback", "Google"];
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

  const qualifiesForShare = rating >= 4;
  const stepCount = qualifiesForShare ? 3 : 2;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === 0) handleEmailNext();
    else if (step === 1) handleOpinionNext();
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

  function handleOpinionNext() {
    if (rating > 0 && rating <= 3 && comment.trim().length === 0) {
      setCommentError("Tell us what happened so we can improve.");
      return;
    }
    setCommentError(null);
    if (qualifiesForShare) {
      setStep(2);
      return;
    }
    void submit(false);
  }

  async function submit(sharedToGoogle: boolean) {
    setPending(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.set("locationSlug", locationSlug);
      formData.set("email", email.trim().toLowerCase());
      formData.set("rating", String(rating));
      formData.set("comment", comment);
      formData.set("sharedToGoogle", String(sharedToGoogle));
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
      className="flex flex-col gap-5 rounded-[26px] bg-white p-6 shadow-card"
    >
      <div className="flex items-center justify-center gap-1" aria-label="Progress">
        {STEPS.slice(0, stepCount).map((label, i) => (
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
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                aria-label={`${star} stars`}
                aria-pressed={rating === star}
                onClick={() => setRating(star)}
                className={cn(
                  "text-4xl transition-all",
                  star <= rating ? "text-amber scale-110" : "text-ink/15 hover:text-amber/60"
                )}
              >
                ★
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="comment">
              {commentRequired(rating) ? "Comment (required)" : "Comment (optional)"}
            </Label>
            <Textarea
              id="comment"
              name="comment"
              placeholder={
                commentRequired(rating)
                  ? "Tell us what happened so we can improve"
                  : "Tell us about your experience"
              }
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
              onClick={() => setStep(0)}
            >
              Back
            </Button>
            <Button
              type="submit"
              size="lg"
              className="h-11 flex-1 rounded-[18px]"
              disabled={rating === 0 || pending}
            >
              {qualifiesForShare ? "Continue" : pending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink text-center">
            Want to share your review on Google?
          </h2>
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 rounded-[18px]"
              disabled={pending}
              onClick={() => void submit(false)}
            >
              No, thanks
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-11 rounded-[18px]"
              disabled={pending}
              onClick={() => void submit(true)}
            >
              {pending ? "Sending..." : "Yes, share"}
            </Button>
          </div>
          <button
            type="button"
            className="text-sm text-body underline underline-offset-2 self-center"
            onClick={() => setStep(1)}
          >
            Back
          </button>
        </div>
      )}

      {submitError && <p className="text-sm text-destructive text-center">{submitError}</p>}
    </form>
  );
}

function commentRequired(rating: number) {
  return rating > 0 && rating <= 3;
}
