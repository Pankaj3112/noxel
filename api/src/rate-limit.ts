import type { MiddlewareHandler } from "hono";
import type { Bindings } from "./worker.js";

// In-memory sliding window rate limiter.
// NOTE: This is per-isolate on Cloudflare Workers, so it won't be globally
// consistent across all edge locations. For stricter enforcement, use
// Cloudflare Rate Limiting rules in wrangler.toml or the dashboard.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number): MiddlewareHandler<{ Bindings: Bindings }> {
  return async (c, next) => {
    const key = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (entry && now < entry.resetAt) {
      if (entry.count >= maxRequests) {
        return c.json({ error: "Too many requests" }, 429);
      }
      entry.count++;
    } else {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    }

    // Periodically clean up expired entries to prevent memory leaks
    if (rateLimitMap.size > 10_000) {
      for (const [k, v] of rateLimitMap) {
        if (now >= v.resetAt) rateLimitMap.delete(k);
      }
    }

    await next();
  };
}
