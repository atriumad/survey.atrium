import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitPolicy = {
  maxAttempts: number;
  windowSeconds: number;
};

export type RateLimitAction = "submit-review" | "login";

export const SUBMIT_REVIEW_POLICY: RateLimitPolicy = {
  maxAttempts: 2,
  windowSeconds: 60,
};

export const LOGIN_POLICY: RateLimitPolicy = {
  maxAttempts: 5,
  windowSeconds: 60,
};

export function getRequestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}

export function buildRateLimitKey(ip: string, action: RateLimitAction): string {
  return `${action}:${ip}`;
}

export async function consumeRateLimit(
  supabase: Pick<SupabaseClient, "rpc">,
  key: string,
  policy: RateLimitPolicy
): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: key,
    p_window_seconds: policy.windowSeconds,
    p_max_attempts: policy.maxAttempts,
  });
  if (error) {
    console.error("consumeRateLimit: failed to check rate limit", error);
    return true;
  }
  return data === true;
}