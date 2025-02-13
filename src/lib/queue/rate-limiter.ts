interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  maxConcurrent: number; // Max concurrent requests
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private activeRequests: Map<string, number> = new Map();
  private readonly config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      windowMs: config?.windowMs ?? 60 * 1000,        // 1 minute default
      maxRequests: config?.maxRequests ?? 30,         // 30 requests per minute
      maxConcurrent: config?.maxConcurrent ?? 2       // 2 concurrent requests
    };
  }

  public isAllowed(userId: string): boolean {
    const now = Date.now();
    
    // Check window-based rate limit
    if (!this.checkWindowLimit(userId, now)) {
      console.log(`Rate limit exceeded for user ${userId} - too many requests in window`);
      return false;
    }

    // Check concurrent requests limit
    if (!this.checkConcurrentLimit(userId)) {
      console.log(`Rate limit exceeded for user ${userId} - too many concurrent requests`);
      return false;
    }

    return true;
  }

  public addRequest(userId: string): void {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    userRequests.push(now);
    this.requests.set(userId, userRequests);

    // Increment active requests
    const activeCount = this.activeRequests.get(userId) || 0;
    this.activeRequests.set(userId, activeCount + 1);
  }

  public removeRequest(userId: string): void {
    // Decrement active requests
    const activeCount = this.activeRequests.get(userId) || 0;
    if (activeCount > 0) {
      this.activeRequests.set(userId, activeCount - 1);
    }
  }

  public getRemainingRequests(userId: string): number {
    const now = Date.now();
    const recentRequests = this.getRecentRequests(userId, now);
    return Math.max(0, this.config.maxRequests - recentRequests.length);
  }

  public getTimeUntilReset(userId: string): number {
    const now = Date.now();
    const recentRequests = this.getRecentRequests(userId, now);
    if (recentRequests.length === 0) return 0;

    const oldestRequest = recentRequests[0];
    return Math.max(0, this.config.windowMs - (now - oldestRequest));
  }

  private checkWindowLimit(userId: string, now: Date | number): boolean {
    const recentRequests = this.getRecentRequests(userId, now);
    return recentRequests.length < this.config.maxRequests;
  }

  private checkConcurrentLimit(userId: string): boolean {
    const activeCount = this.activeRequests.get(userId) || 0;
    return activeCount < this.config.maxConcurrent;
  }

  private getRecentRequests(userId: string, now: Date | number): number[] {
    const userRequests = this.requests.get(userId) || [];
    
    // Filter requests within the time window
    const recentRequests = userRequests.filter(time => 
      now.valueOf() - time < this.config.windowMs
    );

    // Update stored requests if we filtered any out
    if (recentRequests.length < userRequests.length) {
      this.requests.set(userId, recentRequests);
    }

    return recentRequests;
  }

  // Utility methods
  public clearUserHistory(userId: string): void {
    this.requests.delete(userId);
    this.activeRequests.delete(userId);
  }

  public clearAllHistory(): void {
    this.requests.clear();
    this.activeRequests.clear();
  }
} 