import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 5 },  // Ramp up to 5 users
    { duration: '1m', target: 5 },   // Stay at 5 users for 1 minute
    { duration: '30s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    'errors': ['rate<0.1'], // Error rate should be less than 10%
    'http_req_duration': ['p(95)<5000'], // 95% of requests should be below 5s
  },
};

// Simulated data
const mockTweets = [
  {
    id: '123456789',
    text: 'This is a test tweet #testing',
    created_at: new Date().toISOString(),
  },
  // Add more mock tweets as needed
];

const mockProfile = {
  name: 'Test User',
  username: 'testuser',
  description: 'This is a test profile',
  followersCount: 100,
  followingCount: 100,
};

// Test setup - runs once per VU
export function setup() {
  // You would typically get your auth token here
  return {
    authToken: 'your-test-auth-token', // Replace with actual test token
  };
}

// Main test function
export default function(data) {
  const baseUrl = 'http://localhost:3000/api'; // Replace with your actual API base URL
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };

  // Test analyze endpoint
  {
    const analyzePayload = {
      tweets: mockTweets,
      profile: mockProfile,
    };

    const analyzeResponse = http.post(
      `${baseUrl}/analyze`,
      JSON.stringify(analyzePayload),
      { headers }
    );

    check(analyzeResponse, {
      'analyze status is 200': (r) => r.status === 200,
      'analyze response has personality data': (r) => {
        const body = JSON.parse(r.body);
        return body.traits && body.interests;
      },
    });

    errorRate.add(analyzeResponse.status !== 200);
  }

  sleep(1); // Wait 1 second between requests

  // Test chat endpoint
  {
    const chatPayload = {
      message: 'Hello, this is a test message',
      profile: mockProfile,
      analysis: {
        traits: [
          { name: 'openness', score: 7 },
          { name: 'conscientiousness', score: 6 },
        ],
        interests: ['technology', 'testing'],
      },
      tuning: {
        traitModifiers: {},
        interestWeights: {},
        customInterests: [],
        communicationStyle: {
          formality: 'MODERATE',
          enthusiasm: 'MODERATE',
          technicalLevel: 'MODERATE',
          emojiUsage: 'MODERATE',
          verbosity: 'MODERATE',
        },
      },
    };

    const chatResponse = http.post(
      `${baseUrl}/chat`,
      JSON.stringify(chatPayload),
      { headers }
    );

    check(chatResponse, {
      'chat status is 200': (r) => r.status === 200,
      'chat response has message': (r) => {
        const body = JSON.parse(r.body);
        return body.response && typeof body.response === 'string';
      },
    });

    errorRate.add(chatResponse.status !== 200);
  }

  sleep(1); // Wait 1 second between requests
}

// Cleanup function - runs once per VU after all iterations
export function teardown(data) {
  // Cleanup code here if needed
} 