import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const RATE_LIMIT_CONFIG = {
  maxRequests: 100,
  windowSeconds: 60,
};

// In-memory fallback map for degraded local dev mode when Upstash Redis env vars are omitted
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

/**
 * IP-based rate limiter backed by Upstash Redis, with documented in-memory fallback.
 * Note: In-memory fallback does not coordinate limits across multiple serverless instances.
 */
export async function checkRateLimit(ip: string): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Primary mode: Shared Upstash Redis store
  if (url && token) {
    try {
      const redis = new Redis({ url, token });
      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIG.maxRequests,
          `${RATE_LIMIT_CONFIG.windowSeconds} s`
        ),
        analytics: true,
      });

      const result = await ratelimit.limit(ip);
      const resetSeconds = Math.ceil((result.reset - Date.now()) / 1000);

      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        resetSeconds: Math.max(1, resetSeconds),
      };
    } catch (err) {
      console.warn("Upstash Redis connection failed, falling back to in-memory rate limiting:", err);
    }
  }

  // Degraded mode: Local in-memory fixed window fallback
  const now = Date.now();
  const windowMs = RATE_LIMIT_CONFIG.windowSeconds * 1000;
  const entry = inMemoryStore.get(ip);

  if (!entry || now > entry.resetAt) {
    inMemoryStore.set(ip, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      success: true,
      limit: RATE_LIMIT_CONFIG.maxRequests,
      remaining: RATE_LIMIT_CONFIG.maxRequests - 1,
      resetSeconds: RATE_LIMIT_CONFIG.windowSeconds,
    };
  }

  entry.count += 1;
  const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

  if (entry.count > RATE_LIMIT_CONFIG.maxRequests) {
    return {
      success: false,
      limit: RATE_LIMIT_CONFIG.maxRequests,
      remaining: 0,
      resetSeconds: Math.max(1, resetSeconds),
    };
  }

  return {
    success: true,
    limit: RATE_LIMIT_CONFIG.maxRequests,
    remaining: RATE_LIMIT_CONFIG.maxRequests - entry.count,
    resetSeconds: Math.max(1, resetSeconds),
  };
}
