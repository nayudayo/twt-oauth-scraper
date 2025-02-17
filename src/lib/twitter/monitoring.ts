interface APIMetrics {
  requestCount: number;
  errorCount: number;
  totalLatency: number;
  rateLimitHits: number;
  lastRequest: Date | null;
}

interface EndpointMetrics extends APIMetrics {
  rateLimits: {
    limit: number;
    remaining: number;
    reset: number;
  } | null;
}

export class TwitterAPIMonitor {
  private static instance: TwitterAPIMonitor;
  private metrics: Map<string, EndpointMetrics> = new Map();
  private globalMetrics: APIMetrics = {
    requestCount: 0,
    errorCount: 0,
    totalLatency: 0,
    rateLimitHits: 0,
    lastRequest: null
  };

  private constructor() {}

  static getInstance(): TwitterAPIMonitor {
    if (!TwitterAPIMonitor.instance) {
      TwitterAPIMonitor.instance = new TwitterAPIMonitor();
    }
    return TwitterAPIMonitor.instance;
  }

  private getOrCreateEndpointMetrics(endpoint: string): EndpointMetrics {
    if (!this.metrics.has(endpoint)) {
      this.metrics.set(endpoint, {
        requestCount: 0,
        errorCount: 0,
        totalLatency: 0,
        rateLimitHits: 0,
        lastRequest: null,
        rateLimits: null
      });
    }
    return this.metrics.get(endpoint)!;
  }

  recordRequest(endpoint: string, latency: number): void {
    const metrics = this.getOrCreateEndpointMetrics(endpoint);
    metrics.requestCount++;
    metrics.totalLatency += latency;
    metrics.lastRequest = new Date();

    this.globalMetrics.requestCount++;
    this.globalMetrics.totalLatency += latency;
    this.globalMetrics.lastRequest = new Date();
  }

  recordError(endpoint: string, error: Error): void {
    const metrics = this.getOrCreateEndpointMetrics(endpoint);
    metrics.errorCount++;
    metrics.lastRequest = new Date();

    this.globalMetrics.errorCount++;
    this.globalMetrics.lastRequest = new Date();

    // Log error for external monitoring
    console.error(`Twitter API Error [${endpoint}]:`, {
      message: error.message,
      timestamp: new Date().toISOString(),
      endpoint
    });
  }

  recordRateLimit(endpoint: string, limits: { limit: number; remaining: number; reset: number }): void {
    const metrics = this.getOrCreateEndpointMetrics(endpoint);
    metrics.rateLimits = limits;

    if (limits.remaining === 0) {
      metrics.rateLimitHits++;
      this.globalMetrics.rateLimitHits++;

      // Log rate limit hit for external monitoring
      console.warn(`Rate limit hit [${endpoint}]:`, {
        timestamp: new Date().toISOString(),
        endpoint,
        reset: new Date(limits.reset * 1000).toISOString()
      });
    }
  }

  getEndpointMetrics(endpoint: string): EndpointMetrics | null {
    return this.metrics.get(endpoint) || null;
  }

  getGlobalMetrics(): APIMetrics {
    return { ...this.globalMetrics };
  }

  getAverageLatency(endpoint?: string): number {
    if (endpoint) {
      const metrics = this.metrics.get(endpoint);
      if (!metrics || metrics.requestCount === 0) return 0;
      return metrics.totalLatency / metrics.requestCount;
    }

    if (this.globalMetrics.requestCount === 0) return 0;
    return this.globalMetrics.totalLatency / this.globalMetrics.requestCount;
  }

  getErrorRate(endpoint?: string): number {
    if (endpoint) {
      const metrics = this.metrics.get(endpoint);
      if (!metrics || metrics.requestCount === 0) return 0;
      return metrics.errorCount / metrics.requestCount;
    }

    if (this.globalMetrics.requestCount === 0) return 0;
    return this.globalMetrics.errorCount / this.globalMetrics.requestCount;
  }

  getRateLimitStatus(endpoint: string): { remaining: number; reset: Date } | null {
    const metrics = this.metrics.get(endpoint);
    if (!metrics?.rateLimits) return null;

    return {
      remaining: metrics.rateLimits.remaining,
      reset: new Date(metrics.rateLimits.reset * 1000)
    };
  }

  // Get summary of all metrics for logging/monitoring
  getSummary(): {
    global: APIMetrics & { averageLatency: number; errorRate: number };
    endpoints: Record<string, EndpointMetrics & { averageLatency: number; errorRate: number }>;
  } {
    const endpointSummaries: Record<string, EndpointMetrics & { averageLatency: number; errorRate: number }> = {};
    
    this.metrics.forEach((metrics, endpoint) => {
      endpointSummaries[endpoint] = {
        ...metrics,
        averageLatency: this.getAverageLatency(endpoint),
        errorRate: this.getErrorRate(endpoint)
      };
    });

    return {
      global: {
        ...this.globalMetrics,
        averageLatency: this.getAverageLatency(),
        errorRate: this.getErrorRate()
      },
      endpoints: endpointSummaries
    };
  }
} 