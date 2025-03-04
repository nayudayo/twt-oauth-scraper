import { getRedis } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
}

export class RateLimiter {
  private readonly namespace: string;
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(
    namespace: string,
    maxRequests: number = 30,
    windowMs: number = 60 * 1000
  ) {
    this.namespace = namespace;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  private getKey(identifier: string): string {
    return `ratelimit:${this.namespace}:${identifier}`;
  }

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const redis = await getRedis();
    const key = this.getKey(identifier);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Clean up old requests and add new one using Redis sorted set
    const multi = redis.multi();
    
    // Remove old entries
    multi.zremrangebyscore(key, 0, windowStart);
    
    // Add current request
    multi.zadd(key, now, now.toString());
    
    // Get count of requests in window
    multi.zcard(key);
    
    // Set expiry on the key
    multi.expire(key, Math.ceil(this.windowMs / 1000));

    const results = await multi.exec();
    if (!results) {
      throw new Error('Failed to execute rate limit check');
    }

    const requestCount = results[2][1] as number;
    const allowed = requestCount <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - requestCount);
    const oldestRequest = allowed ? now : await this.getOldestRequest(key);
    const reset = Math.ceil((oldestRequest + this.windowMs) / 1000);

    return {
      allowed,
      remaining,
      reset
    };
  }

  private async getOldestRequest(key: string): Promise<number> {
    const redis = await getRedis();
    const oldest = await redis.zrange(key, 0, 0);
    return oldest.length ? parseInt(oldest[0]) : Date.now();
  }
} 