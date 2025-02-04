# Conversation Model Implementation Plan

## Overview
This document outlines the implementation plan for a streamlined conversational model with dual memory system (Redis for short-term, Chroma for long-term) optimized for high concurrent users.

## Key Features
1. Dual memory system without caching layer
2. Activity-based Redis TTL
3. Long-term memory in Chroma for historical context
4. Single LLM (GPT-4o-mini) implementation
5. Error recovery mechanisms
6. Concurrent user handling

## Memory Architecture

### Short-Term Memory (Redis)
```typescript
interface RedisConfig {
  // Basic configuration
  keyPrefix: 'chat:',
  
  // TTL configuration
  ttl: {
    active: 24 * 60 * 60,    // 24 hours for active users
    inactive: 1 * 60 * 60    // 1 hour for inactive users
  },
  
  // Rate limiting
  rateLimit: {
    perUser: 30,             // requests per minute
    global: 10000            // total requests per minute
  }
}

interface RedisMessage {
  user_id: string
  last_message: string
  timestamp: string
  activity_level: 'active' | 'inactive'
}
```

### Long-Term Memory (Chroma)
```typescript
interface ChromaMessage {
  id: string
  user_id: string
  content: string
  embedding: number[]
  metadata: {
    timestamp: string
    type: 'user' | 'assistant'
    conversation_id: string  // Added for multi-conversation support
  }
}
```

## Memory System Architecture

```typescript
class DualMemoryHandler {
  private redis: Redis.Client;
  private chroma: ChromaClient;
  private openai: OpenAI;

  // Configuration
  private config = {
    redis: {
      keyPrefix: 'chat:',
      ttl: {
        active: 24 * 60 * 60,
        inactive: 1 * 60 * 60
      }
    },
    chroma: {
      collectionPrefix: 'user_',
      maxResults: 5
    },
    llm: {
      maxTokens: 150,
      temperature: 0.7
    }
  };

  async processMessage(userId: string, message: string): Promise<string> {
    // 1. Check rate limits
    if (!await this.checkRateLimits(userId)) {
      throw new Error('Rate limit exceeded');
    }

    // 2. Store in Chroma first (source of truth)
    try {
      await this.storeLongTerm(userId, message);
    } catch (error) {
      throw new Error('Failed to store in long-term memory');
    }

    // 3. Get historical context
    const historicalContext = await this.getHistoricalContext(userId, message);

    // 4. Update Redis (can be recovered if fails)
    try {
      await this.storeShortTerm(userId, message);
    } catch (error) {
      console.error('Short-term memory update failed:', error);
      // Continue as Redis is recoverable
    }

    // 5. Generate response
    const response = await this.generateResponse(message, historicalContext);
    
    return response;
  }

  private async checkRateLimits(userId: string): Promise<boolean> {
    const key = `${this.config.redis.keyPrefix}${userId}:rate`;
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.expire(key, 60); // 1 minute window
    }
    
    return count <= 30; // 30 requests per minute
  }

  private async storeShortTerm(userId: string, message: string) {
    const activityLevel = await this.getUserActivityLevel(userId);
    const ttl = this.config.redis.ttl[activityLevel];
    
    await this.redis.set(
      `${this.config.redis.keyPrefix}${userId}:last`,
      message,
      'EX',
      ttl
    );
  }

  private async getUserActivityLevel(userId: string): Promise<'active' | 'inactive'> {
    const lastActivity = await this.redis.get(
      `${this.config.redis.keyPrefix}${userId}:last_active`
    );
    
    return lastActivity && 
           Date.now() - parseInt(lastActivity) < 24 * 60 * 60 * 1000 
           ? 'active' 
           : 'inactive';
  }
}
```

## Memory Recovery

```typescript
class MemoryRecovery {
  async recoverRedisContext(userId: string) {
    try {
      // Get most recent from Chroma
      const recent = await this.getRecentFromChroma(userId);
      
      // Restore to Redis
      await this.redis.set(
        `chat:${userId}:last`,
        recent,
        'EX',
        this.config.redis.ttl.active
      );
    } catch (error) {
      console.error('Recovery failed:', error);
    }
  }
}
```

## Implementation Checklist

### Phase 1: Core Infrastructure (Day 1)
- [x] Directory Setup
  - [x] Create `src/lib/memory` directory
  - [x] Create `src/lib/memory/types` directory
  - [x] Create `src/lib/memory/utils` directory

- [✓] Type Definitions (Redis)
  - [✓] Create `types/redis.ts`
    ```typescript
    // Activity level type
    type ActivityLevel = 'active' | 'inactive'

    // Redis configuration
    interface RedisConfig {
      host: string
      port: number
      password?: string
      keyPrefix: string
      ttl: {
        active: number    // 24 hours
        inactive: number  // 1 hour
      }
      rateLimit: {
        perUser: number   // requests per minute
        global: number    // total requests per minute
        window: number    // time window in seconds
      }
    }

    // Redis message structure
    interface RedisMessage {
      content: string
      userId: string
      timestamp: number
      type: 'user' | 'assistant'
      conversationId: string
      metadata?: {
        activityLevel: ActivityLevel
        lastActive: number
      }
    }

    // Additional implemented types:
    // - RedisOptions (connection pool, retry strategy)
    // - RateLimitInfo
    // - RedisOperationResult
    // - REDIS_KEYS constants
    // - Default configurations
    ```

- [✓] Type Definitions (Next)
  - [✓] Create `types/chroma.ts`
    ```typescript
    // ChromaDB client interfaces
    interface IChromaClient {
      createCollection(name: string, metadata?: Record<string, unknown>): Promise<IChromaCollection>;
      getCollection(name: string): Promise<IChromaCollection>;
      deleteCollection(name: string): Promise<void>;
      listCollections(): Promise<string[]>;
    }

    interface IChromaCollection {
      name: string;
      metadata: Record<string, unknown>;
      add(documents: string[], metadatas?: Record<string, unknown>[], ids?: string[]): Promise<void>;
      query(queryTexts: string[], nResults?: number, where?: Record<string, unknown>): Promise<{
        ids: string[][];
        distances: number[][];
        metadatas: Record<string, unknown>[][];
        documents: string[][];
      }>;
    }

    // Additional implemented types:
    // - ChromaConfig (connection, collection settings, embedding settings)
    // - ChromaMessage (message structure with metadata)
    // - ChromaCollectionOptions (collection creation options)
    // - ChromaQueryOptions (query parameters)
    // - ChromaOperationResult (operation results with error handling)
    // - ChromaCollectionManager (collection management interface)
    // - Default configurations and key patterns
    ```

- [ ] Type Definitions (Next)
  - [ ] Create `types/index.ts`
    ```typescript
    // Common types
    interface MemoryOptions
    type ActivityLevel
    interface RateLimitConfig
    ```

- [ ] Redis Setup
  - [ ] Install dependencies
    ```bash
    npm install ioredis @types/ioredis
    ```
  - [ ] Implement RedisMemory class
  - [ ] Set up connection pooling
  - [ ] Add error handling
  - [ ] Implement activity tracking
  - [ ] Add rate limiting

- [ ] Chroma Setup
  - [ ] Install dependencies
    ```bash
    npm install chromadb @xenova/transformers
    ```
  - [ ] Implement ChromaMemory class
  - [ ] Set up collections management
  - [ ] Add error handling
  - [ ] Configure embeddings

- [ ] Error Recovery
  - [ ] Implement MemoryRecovery class
  - [ ] Add Redis recovery mechanisms
  - [ ] Set up Chroma backup strategies
  - [ ] Add logging

### Phase 2: Memory Integration (Day 2)
- [ ] Core Integration
  - [ ] Implement DualMemorySystem
  - [ ] Set up message processing flow
  - [ ] Add context retrieval
  - [ ] Implement rate limiting

- [ ] Type Definitions
  - [ ] Define message interfaces
  - [ ] Define configuration types
  - [ ] Define error types
  - [ ] Define response types

- [ ] Utils
  - [ ] Add retry mechanisms
  - [ ] Implement logging utilities
  - [ ] Add monitoring helpers
  - [ ] Create test utilities

### Phase 3: Testing & Monitoring (Day 3)
- [ ] Unit Tests
  - [ ] Test Redis operations
  - [ ] Test ChromaDB Integration (Next)
    - [ ] Test collection creation and management
    - [ ] Test document storage and retrieval
    - [ ] Test query operations
    - [ ] Test error handling

- [ ] Integration Tests
  - [ ] Test dual memory system
  - [ ] Test concurrent access
  - [ ] Test error scenarios
  - [ ] Test recovery flows

- [ ] Monitoring
  - [ ] Set up metrics collection
  - [ ] Add performance monitoring
  - [ ] Implement error tracking
  - [ ] Add usage analytics

### Phase 4: Production Readiness (Day 4)
- [ ] Documentation
  - [ ] Add inline documentation
  - [ ] Create usage examples
  - [ ] Document error handling
  - [ ] Add deployment guide

- [ ] Performance
  - [ ] Optimize Redis operations
  - [ ] Tune Chroma queries
  - [ ] Add caching where needed
  - [ ] Optimize memory usage

- [ ] Security
  - [ ] Add input validation
  - [ ] Implement rate limiting
  - [ ] Set up authentication
  - [ ] Add data encryption

### Phase 5: Integration & Deployment
- [ ] Chat Integration
  - [ ] Update chat routes
  - [ ] Add conversation management
  - [ ] Implement context handling
  - [ ] Add error responses

- [ ] Deployment
  - [ ] Set up Redis cluster
  - [ ] Configure Chroma deployment
  - [ ] Add monitoring alerts
  - [ ] Create backup procedures

## Monitoring

```typescript
interface Metrics {
  activeUsers: number
  averageResponseTime: number
  errorRate: number
  memory: {
    redisUsage: {
      activeUsers: number,
      totalKeys: number,
      memoryUsed: number
    },
    chromaUsage: number
  }
  rateLimiting: {
    totalThrottled: number,
    perUserThrottled: Record<string, number>
  }
}
```

## Key Benefits

1. **Memory Efficiency**
   - Activity-based TTL
   - Automatic cleanup
   - Predictable memory usage

2. **Scalability**
   - Rate limiting built-in
   - Activity-based optimization
   - Recovery mechanisms

3. **Reliability**
   - Chroma as source of truth
   - Redis as recoverable cache
   - Clear error handling

This implementation provides:
- Efficient dual memory system
- Support for high concurrent users
- Built-in rate limiting
- Activity-based optimization
- Automatic cleanup
- Recovery mechanisms 

## Detailed Message Flow Examples

### 1. Initial User Connection
```typescript
const initialSetup = {
  event: "User opens chat",
  actions: {
    redis: {
      // Create rate limit counter
      command: "SETEX chat:user123:rate 60 0",
      // Set initial activity status
      command: "SETEX chat:user123:active 86400 true"
    },
    chroma: {
      // Create user collection if doesn't exist
      command: "createCollection('user_123')"
    }
  }
};
```

### 2. First Message Flow
```typescript
const firstMessage = {
  input: {
    user: "What do you think about the crypto market today?",
    timestamp: "2024-03-20T10:00:00Z"
  },
  
  flow: {
    // Step 1: Rate Limit Check
    rateLimit: {
      redis: {
        command: "INCR chat:user123:rate",
        result: 1,
        action: "Allow (1 < 30 per minute)"
      }
    },
    
    // Step 2: Store in Chroma (Primary Storage)
    chroma: {
      operation: "addMessage",
      data: {
        id: "msg_1",
        content: "What do you think about the crypto market today?",
        embedding: [0.1, 0.2, ...], // Vector embedding
        metadata: {
          timestamp: "2024-03-20T10:00:00Z",
          type: "user",
          topic: "crypto"
        }
      }
    },
    
    // Step 3: No Previous Context Yet
    context: {
      redis: "No last message",
      chroma: "No relevant history"
    },
    
    // Step 4: Store in Redis (Fast Access)
    redis: {
      command: `SET chat:user123:last {
        "content": "What do you think about the crypto market today?",
        "timestamp": "2024-03-20T10:00:00Z",
        "type": "user"
      } EX 86400`  // 24 hours TTL
    },
    
    // Step 5: Generate Response
    llm: {
      input: {
        messages: [
          {
            role: "system",
            content: "You are roleplaying as the user's Twitter personality."
          },
          {
            role: "user",
            content: "What do you think about the crypto market today?"
          }
        ]
      },
      output: "The crypto market is showing interesting patterns today! BTC's volatility..."
    }
  }
};
```

### 3. Follow-up Message Flow
```typescript
const followUpMessage = {
  input: {
    user: "What about Ethereum specifically?",
    timestamp: "2024-03-20T10:05:00Z"
  },
  
  flow: {
    // Step 1: Rate Limit Check
    rateLimit: {
      redis: {
        command: "INCR chat:user123:rate",
        result: 2,
        action: "Allow (2 < 30 per minute)"
      }
    },
    
    // Step 2: Get Context
    context: {
      // Get immediate context from Redis
      redis: {
        command: "GET chat:user123:last",
        result: {
          content: "The crypto market is showing interesting patterns today!...",
          timestamp: "2024-03-20T10:00:00Z",
          type: "assistant"
        }
      },
      
      // Get relevant history from Chroma
      chroma: {
        query: "Ethereum cryptocurrency market",
        results: [
          {
            content: "What do you think about the crypto market today?",
            similarity: 0.89
          },
          {
            content: "The crypto market is showing interesting patterns today!...",
            similarity: 0.85
          }
        ]
      }
    },
    
    // Step 3: Store New Message
    storage: {
      // Store in Chroma first (source of truth)
      chroma: {
        operation: "addMessage",
        data: {
          id: "msg_2",
          content: "What about Ethereum specifically?",
          embedding: [0.2, 0.3, ...],
          metadata: {
            timestamp: "2024-03-20T10:05:00Z",
            type: "user",
            topic: "crypto",
            subtopic: "ethereum"
          }
        }
      },
      
      // Update Redis
      redis: {
        command: `SET chat:user123:last {
          "content": "What about Ethereum specifically?",
          "timestamp": "2024-03-20T10:05:00Z",
          "type": "user"
        } EX 86400`
      }
    },
    
    // Step 4: Generate Contextual Response
    llm: {
      input: {
        messages: [
          {
            role: "system",
            content: "You are roleplaying as the user's Twitter personality."
          },
          {
            role: "system",
            content: "Previous context: Discussion about general crypto market trends."
          },
          {
            role: "assistant",
            content: "The crypto market is showing interesting patterns today!..."
          },
          {
            role: "user",
            content: "What about Ethereum specifically?"
          }
        ]
      },
      output: "Ethereum's looking particularly interesting because..."
    }
  }
};
```

### 4. Inactivity Handling
```typescript
const inactivityFlow = {
  event: "User returns after 2 hours",
  
  flow: {
    // Check activity status
    activityCheck: {
      redis: {
        command: "GET chat:user123:last_active",
        result: "2024-03-20T10:05:00Z",
        action: "Mark as inactive"
      }
    },
    
    // Adjust TTL for inactive user
    ttlUpdate: {
      redis: {
        command: "EXPIRE chat:user123:last 3600", // 1 hour TTL
        reason: "User inactive"
      }
    },
    
    // Recovery available if needed
    recovery: {
      available: true,
      source: "Chroma historical data",
      method: "recoverRedisContext"
    }
  }
};
```

### Key Flow Characteristics

1. **Data Consistency**
   - Chroma writes happen before Redis
   - Redis failures are recoverable
   - TTL adjusts based on activity

2. **Context Management**
   - Immediate context from Redis
   - Historical context from Chroma
   - Context merging in LLM prompt

3. **Error Handling**
   - Rate limit failures
   - Storage failures
   - Recovery procedures

4. **Performance Optimization**
   - Activity-based TTL
   - Minimal Redis storage
   - Efficient context retrieval

This implementation provides:
- Efficient dual memory system
- Support for high concurrent users
- Built-in rate limiting
- Activity-based optimization
- Automatic cleanup
- Recovery mechanisms 