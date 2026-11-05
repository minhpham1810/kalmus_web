const hits = new Map<string, number[]>();

/** In-memory sliding-window limiter; returns true when the key is over `limit` hits per `windowMs`. */
export function isRateLimited(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  hits.set(key, [...recent, now]);
  return false;
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || "unknown";
}
