"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  buildRateLimitKey,
  consumeRateLimit,
  getRequestIp,
  LOGIN_POLICY,
} from "@/lib/rate-limit";

export async function login(formData: FormData) {
  const email = String(formData.get("email")).trim().toLowerCase();
  const password = String(formData.get("password"));

  const headersList = await headers();
  const ip = getRequestIp(headersList);
  const supabase = await createClient();
  const allowed = await consumeRateLimit(
    supabase,
    buildRateLimitKey(ip, "login"),
    LOGIN_POLICY
  );

  if (!allowed) {
    redirect(`/dashboard/login?error=2&email=${encodeURIComponent(email)}`);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/dashboard/login?error=1&email=${encodeURIComponent(email)}`);
  }

  redirect("/dashboard");
}