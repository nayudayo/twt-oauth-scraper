"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterAPIMonitor = void 0;
class TwitterAPIMonitor {
    constructor() {
        this.metrics = new Map();
        this.globalMetrics = {
            requestCount: 0,
            errorCount: 0,
            totalLatency: 0,
            rateLimitHits: 0,
            lastRequest: null
        };
    }
    static getInstance() {
        if (!TwitterAPIMonitor.instance) {
            TwitterAPIMonitor.instance = new TwitterAPIMonitor();
        }
        return TwitterAPIMonitor.instance;
    }
    getOrCreateEndpointMetrics(endpoint) {
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
        return this.metrics.get(endpoint);
    }
    recordRequest(endpoint, latency) {
        const metrics = this.getOrCreateEndpointMetrics(endpoint);
        metrics.requestCount++;
        metrics.totalLatency += latency;
        metrics.lastRequest = new Date();
        this.globalMetrics.requestCount++;
        this.globalMetrics.totalLatency += latency;
        this.globalMetrics.lastRequest = new Date();
    }
    recordError(endpoint, error) {
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
    recordRateLimit(endpoint, limits) {
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
    getEndpointMetrics(endpoint) {
        return this.metrics.get(endpoint) || null;
    }
    getGlobalMetrics() {
        return Object.assign({}, this.globalMetrics);
    }
    getAverageLatency(endpoint) {
        if (endpoint) {
            const metrics = this.metrics.get(endpoint);
            if (!metrics || metrics.requestCount === 0)
                return 0;
            return metrics.totalLatency / metrics.requestCount;
        }
        if (this.globalMetrics.requestCount === 0)
            return 0;
        return this.globalMetrics.totalLatency / this.globalMetrics.requestCount;
    }
    getErrorRate(endpoint) {
        if (endpoint) {
            const metrics = this.metrics.get(endpoint);
            if (!metrics || metrics.requestCount === 0)
                return 0;
            return metrics.errorCount / metrics.requestCount;
        }
        if (this.globalMetrics.requestCount === 0)
            return 0;
        return this.globalMetrics.errorCount / this.globalMetrics.requestCount;
    }
    getRateLimitStatus(endpoint) {
        const metrics = this.metrics.get(endpoint);
        if (!(metrics === null || metrics === void 0 ? void 0 : metrics.rateLimits))
            return null;
        return {
            remaining: metrics.rateLimits.remaining,
            reset: new Date(metrics.rateLimits.reset * 1000)
        };
    }
    // Get summary of all metrics for logging/monitoring
    getSummary() {
        const endpointSummaries = {};
        this.metrics.forEach((metrics, endpoint) => {
            endpointSummaries[endpoint] = Object.assign(Object.assign({}, metrics), { averageLatency: this.getAverageLatency(endpoint), errorRate: this.getErrorRate(endpoint) });
        });
        return {
            global: Object.assign(Object.assign({}, this.globalMetrics), { averageLatency: this.getAverageLatency(), errorRate: this.getErrorRate() }),
            endpoints: endpointSummaries
        };
    }
}
exports.TwitterAPIMonitor = TwitterAPIMonitor;
