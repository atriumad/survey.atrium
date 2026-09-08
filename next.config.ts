import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Skip Next.js's auto-generated AGENTS.md/CLAUDE.md agent-rules files;
  // this repo manages its own agent docs under .superpowers/.
  agentRules: false,
};

export default nextConfig;
