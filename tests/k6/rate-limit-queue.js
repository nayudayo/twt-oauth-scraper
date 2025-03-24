import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const queuedRequests = Counter('queued_requests');
const rateLimitedRequests = Counter('rate_limited_requests');

// Test configuration
export const options = {
  stages: [
    { duration: '10s', target: 10 },  // Quick ramp-up to 10 users
    { duration: '20s', target: 10 },  // Sustained load
    { duration: '5s', target: 20 },   // Burst to trigger rate limiting
    { duration: '10s', target: 20 },  // Maintain burst
    { duration: '5s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'errors': ['rate<0.2'],           // Allow higher error rate due to rate limiting
    'http_req_duration': ['p(95)<10000'], // 95% of requests should be below 10s
  },
};

// Mock data for requests
const mockAnalysisRequest = {
  tweets: [
    {
      id: '123456789',
      text: 'Test tweet for rate limiting #test',
      created_at: new Date().toISOString(),
    },
  ],
  profile: {
    name: 'Rate Test User',
    username: 'ratelimituser',
    description: 'Testing rate limits',
    followersCount: 100,
    followingCount: 100,
  },
};

// Test setup
export function setup() {
  return {
    authToken: 'your-test-auth-token', // Replace with actual test token
  };
}

// Main test function
export default function(data) {
  const baseUrl = 'http://localhost:3000/api';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };

  // Test rapid analysis requests to trigger rate limiting
  for (let i = 0; i < 3; i++) {
    const analyzeResponse = http.post(
      `${baseUrl}/analyze`,
      JSON.stringify(mockAnalysisRequest),
      { headers }
    );

    // Check for rate limiting response
    if (analyzeResponse.status === 429) {
      rateLimitedRequests.add(1);
      check(analyzeResponse, {
        'rate limit response has retry-after header': (r) => r.headers['Retry-After'] !== undefined,
      });
    } else if (analyzeResponse.status === 202) {
      // Request was queued
      queuedRequests.add(1);
      check(analyzeResponse, {
        'queued response has job id': (r) => {
          const body = JSON.parse(r.body);
          return body.jobId !== undefined;
        },
      });
    }

    errorRate.add(analyzeResponse.status >= 500);

    // Small sleep to not overwhelm the server completely
    sleep(0.1);
  }

  // Test queue status endpoint
  const queueStatusResponse = http.get(
    `${baseUrl}/queue/status`,
    { headers }
  );

  check(queueStatusResponse, {
    'queue status is 200': (r) => r.status === 200,
    'queue status has required fields': (r) => {
      const body = JSON.parse(r.body);
      return (
        typeof body.activeRequests === 'number' &&
        typeof body.queueLength === 'number' &&
        typeof body.avgProcessingTime === 'number'
      );
    },
  });

  // Test rate limit status endpoint
  const rateLimitResponse = http.get(
    `${baseUrl}/ratelimit/status`,
    { headers }
  );

  check(rateLimitResponse, {
    'rate limit status is 200': (r) => r.status === 200,
    'rate limit status has required fields': (r) => {
      const body = JSON.parse(r.body);
      return (
        typeof body.remaining === 'number' &&
        typeof body.reset === 'number'
      );
    },
  });
}

// Cleanup function
export function teardown(data) {
  // No cleanup needed for rate limit tests
} 