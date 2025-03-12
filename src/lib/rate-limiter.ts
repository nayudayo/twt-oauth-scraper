export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
}

export class RateLimiter {
  private readonly namespace: string;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly requests: Map<string, number[]>;

  constructor(
    namespace: string,
    maxRequests: number = 30,
    windowMs: number = 60 * 1000
  ) {
    this.namespace = namespace;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  private getKey(identifier: string): string {
    return `${this.namespace}:${identifier}`;
  }

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const key = this.getKey(identifier);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or initialize request timestamps array
    let timestamps = this.requests.get(key) || [];
    
    // Remove old timestamps
    timestamps = timestamps.filter(time => time > windowStart);
    
    // Add current request timestamp
    timestamps.push(now);
    
    // Update the map
    this.requests.set(key, timestamps);

    const requestCount = timestamps.length;
    const allowed = requestCount <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - requestCount);
    
    // If not allowed, reset time is when the oldest request expires
    // If allowed, reset time is when the current request expires
    const resetTimestamp = allowed ? now : timestamps[0];
    const reset = Math.ceil((resetTimestamp + this.windowMs) / 1000);

    return {
      allowed,
      remaining,
      reset
    };
  }

  // Cleanup method to prevent memory leaks
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(time => time > windowStart);
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }
} 