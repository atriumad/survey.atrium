const WINDOW_MS = 60_000;
const lastSubmission = new Map<string, number>();

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const last = lastSubmission.get(ip);
  lastSubmission.set(ip, now);
  return last !== undefined && now - last < WINDOW_MS;
}