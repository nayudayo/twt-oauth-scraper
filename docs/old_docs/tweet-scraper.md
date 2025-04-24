```json
{
  "title": "Tweet Scraping System Documentation",
  "version": "1.0",
  "lastUpdated": "2024",
  
  "overview": {
    "description": "Documentation of the tweet scraping system using twitter-api.io",
    "mainComponents": [
      "TwitterAPIClient",
      "Worker Thread System",
      "Database Integration"
    ]
  },

  "apiEndpoints": {
    "baseUrl": "https://api.twitterapi.io/twitter",
    "available": {
      "userTweets": {
        "endpoint": "/user/last_tweets",
        "parameters": {
          "userName": "string",
          "cursor": "string (optional)",
          "includeReplies": "boolean"
        },
        "rateLimit": {
          "requests": 50,
          "window": "60 seconds"
        },
        "response": {
          "tweets": "Array of tweet objects",
          "hasNextPage": "boolean",
          "nextCursor": "string (if hasNextPage is true)"
        }
      },
      "tweetReplies": {
        "endpoint": "/tweet/replies",
        "parameters": {
          "tweetId": "string (required)",
          "cursor": "string (optional)"
        },
        "rateLimit": {
          "requests": 50,
          "window": "60 seconds"
        },
        "response": {
          "replies": "Array of reply objects",
          "hasNextPage": "boolean",
          "nextCursor": "string (if hasNextPage is true)"
        }
      },
      "userProfile": {
        "endpoint": "/user/profile",
        "parameters": {
          "userName": "string"
        }
      }
    }
  },

  "initialization": {
    "entryPoint": "src/app/api/scrape/route.ts",
    "flow": [
      {
        "step": "Client Request",
        "details": "POST request to /api/scrape with username and sessionId"
      },
      {
        "step": "Session Validation",
        "details": "Verify user session and authorization"
      },
      {
        "step": "Worker Initialization",
        "details": "Create worker thread for scraping process"
      }
    ],
    "configuration": {
      "maxWorkers": 16,
      "maxQueueSize": 100,
      "batchSize": 100,
      "maxTweets": 1000
    }
  },

  "scrapingProcess": {
    "components": {
      "client": {
        "class": "TwitterAPIClient",
        "location": "src/lib/twitter/client.ts",
        "features": [
          "Rate limiting handling",
          "Automatic retries with exponential backoff",
          "Session management",
          "Response transformation"
        ]
      },
      "worker": {
        "file": "src/lib/twitter/worker.ts",
        "responsibilities": [
          "Handle tweet collection",
          "Manage pagination",
          "Transform data",
          "Send progress updates",
          "Save to database"
        ]
      }
    },
    "dataFlow": [
      {
        "stage": "Initial Request",
        "action": "Fetch user profile",
        "output": "Basic user information"
      },
      {
        "stage": "Tweet Collection",
        "action": "Two-step tweet fetching process",
        "steps": [
          {
            "step": 1,
            "description": "Fetch user tweets",
            "endpoint": "/user/last_tweets",
            "details": {
              "batchSize": 100,
              "maxTweets": 1000,
              "includesReplies": true
            }
          },
          {
            "step": 2,
            "description": "Fetch replies for each tweet",
            "endpoint": "/tweet/replies",
            "details": {
              "processType": "Sequential processing",
              "rateLimitAware": true,
              "pagination": "Cursor-based per tweet"
            }
          }
        ]
      },
      {
        "stage": "Data Processing",
        "actions": [
          "Transform API response to internal format",
          "Handle date formatting",
          "Process metadata",
          "Deduplicate tweets",
          "Link replies to parent tweets"
        ]
      }
    ],
    "tweetProcessingFlow": {
      "description": "Detailed flow of tweet and reply collection",
      "steps": [
        {
          "step": 1,
          "action": "Get user tweets",
          "endpoint": "/user/last_tweets",
          "output": "Array of tweet objects with IDs"
        },
        {
          "step": 2,
          "action": "Extract tweet IDs",
          "details": "Store tweet IDs for reply fetching"
        },
        {
          "step": 3,
          "action": "Fetch replies",
          "endpoint": "/tweet/replies",
          "details": {
            "input": "Tweet IDs from step 2",
            "process": "Fetch replies for each tweet ID",
            "rateLimit": "Handle rate limits between requests",
            "pagination": "Handle pagination for replies if needed"
          }
        },
        {
          "step": 4,
          "action": "Data merging",
          "details": "Associate replies with their parent tweets"
        }
      ]
    }
  },

  "dataOutput": {
    "streams": {
      "realtime": {
        "type": "Server-Sent Events",
        "events": [
          {
            "type": "progress",
            "data": {
              "username": "string",
              "tweets": "Tweet[]",
              "isChunk": "boolean",
              "chunkIndex": "number",
              "totalTweets": "number",
              "scanProgress": {
                "phase": "string",
                "count": "number"
              }
            }
          },
          {
            "type": "complete",
            "data": {
              "username": "string",
              "totalTweets": "number",
              "scanProgress": {
                "phase": "complete",
                "count": "number"
              }
            }
          }
        ]
      }
    },
    "storage": {
      "database": {
        "tables": {
          "tweets": {
            "columns": [
              "id",
              "user_id",
              "text",
              "created_at",
              "url",
              "is_reply",
              "metadata"
            ],
            "indexes": [
              "idx_tweets_user_created",
              "idx_tweets_created",
              "idx_tweets_text"
            ]
          }
        },
        "operations": {
          "saveTweets": {
            "location": "src/lib/db/adapters/postgres/tweet-operations.ts",
            "features": [
              "Batch processing",
              "Deduplication",
              "Metadata merging",
              "Transaction support"
            ]
          }
        }
      }
    }
  },

  "monitoring": {
    "metrics": {
      "tracked": [
        "Request count",
        "Error count",
        "Average latency",
        "Rate limit status",
        "Active workers",
        "Queue length"
      ],
      "location": "src/lib/twitter/monitoring.ts"
    },
    "rateLimit": {
      "tracking": {
        "windowMs": 60000,
        "maxRequests": 50,
        "maxConcurrent": 3
      }
    }
  },

  "errorHandling": {
    "retryStrategy": {
      "maxRetries": 3,
      "baseDelay": 1000,
      "maxDelay": 30000,
      "backoff": "exponential with jitter"
    },
    "errorTypes": [
      "Rate limit exceeded",
      "Network errors",
      "API errors",
      "Database errors"
    ]
  }
} 