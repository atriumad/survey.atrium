import type { NextConfig } from "next";

const connectSrc = ["'self'"];
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  connectSrc.push(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

const scriptSrc = ["'self'", "'unsafe-inline'"];
// React dev mode uses eval() for debugging features like source-aware callstacks.
// Production builds never eval, so keep 'unsafe-eval' out of the prod CSP.
if (process.env.NODE_ENV === "development") {
  scriptSrc.push("'unsafe-eval'");
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src ${scriptSrc.join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSrc.join(" ")}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  // Skip Next.js's auto-generated AGENTS.md/CLAUDE.md agent-rules files;
  // this repo manages its own agent docs under .superpowers/.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;