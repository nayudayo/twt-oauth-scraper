import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '20s', target: 3 },  // Ramp up to 3 users
    { duration: '40s', target: 3 },  // Stay at 3 users for 40 seconds
    { duration: '20s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    'errors': ['rate<0.1'],          // Error rate should be less than 10%
    'http_req_duration': ['p(95)<3000'], // 95% of requests should be below 3s
  },
};

// Mock data
const mockAnalysis = {
  traits: [
    { name: 'openness', score: 7 },
    { name: 'conscientiousness', score: 6 },
  ],
  interests: ['technology', 'testing'],
  communicationStyle: {
    formality: 'MODERATE',
    enthusiasm: 'MODERATE',
    technicalLevel: 'MODERATE',
    emojiUsage: 'MODERATE',
    verbosity: 'MODERATE',
  },
};

// Test setup
export function setup() {
  return {
    authToken: 'your-test-auth-token', // Replace with actual test token
    testUsername: 'testuser_' + Date.now(),
  };
}

// Main test function
export default function(data) {
  const baseUrl = 'http://localhost:3000/api'; // Replace with your actual API base URL
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };

  // Test personality cache operations
  {
    // Test saving to cache
    const cachePayload = {
      analysisData: mockAnalysis,
      version: '1.0',
    };

    const cacheResponse = http.post(
      `${baseUrl}/personality/${data.testUsername}/cache`,
      JSON.stringify(cachePayload),
      { headers }
    );

    check(cacheResponse, {
      'cache save status is 200': (r) => r.status === 200,
      'cache save response has success': (r) => {
        const body = JSON.parse(r.body);
        return body.success === true;
      },
    });

    errorRate.add(cacheResponse.status !== 200);
  }

  sleep(1); // Wait 1 second between requests

  // Test analysis job operations
  {
    // Create analysis job
    const jobPayload = {
      userId: data.testUsername,
      totalChunks: 5,
    };

    const createJobResponse = http.post(
      `${baseUrl}/analysis/job`,
      JSON.stringify(jobPayload),
      { headers }
    );

    check(createJobResponse, {
      'job creation status is 200': (r) => r.status === 200,
      'job creation returns job id': (r) => {
        const body = JSON.parse(r.body);
        return typeof body.jobId === 'number';
      },
    });

    if (createJobResponse.status === 200) {
      const jobId = JSON.parse(createJobResponse.body).jobId;

      // Test job status check
      const jobStatusResponse = http.get(
        `${baseUrl}/analysis/job/${jobId}`,
        { headers }
      );

      check(jobStatusResponse, {
        'job status check is 200': (r) => r.status === 200,
        'job status has required fields': (r) => {
          const body = JSON.parse(r.body);
          return body.status && typeof body.progress === 'number';
        },
      });

      errorRate.add(jobStatusResponse.status !== 200);
    }
  }

  sleep(1); // Wait 1 second between requests

  // Test analysis history retrieval
  {
    const historyResponse = http.get(
      `${baseUrl}/analysis/history/${data.testUsername}?limit=5`,
      { headers }
    );

    check(historyResponse, {
      'history retrieval status is 200': (r) => r.status === 200,
      'history response is an array': (r) => {
        const body = JSON.parse(r.body);
        return Array.isArray(body.history);
      },
    });

    errorRate.add(historyResponse.status !== 200);
  }
}

// Cleanup function
export function teardown(data) {
  // Here you might want to clean up test data from the database
  // This would typically be done through a dedicated cleanup endpoint
  const baseUrl = 'http://localhost:3000/api';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };

  http.delete(
    `${baseUrl}/test/cleanup/${data.testUsername}`,
    null,
    { headers }
  );
} 