import { Redis } from 'ioredis'

// Activity level type
export type ActivityLevel = 'active' | 'inactive'

// Redis configuration
export interface RedisConfig {
  // Connection
  host: string
  port: number
  password?: string
  
  // Key prefixing
  keyPrefix: string
  
  // TTL configuration (in seconds)
  ttl: {
    active: number    // 24 hours
    inactive: number  // 1 hour
  }
  
  // Rate limiting
  rateLimit: {
    perUser: number   // requests per minute
    global: number    // total requests per minute
    window: number    // time window in seconds
  }
}

// Redis message structure
export interface RedisMessage {
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

// Redis connection options
export interface RedisOptions {
  // Retry strategy
  retry: {
    maxAttempts: number
    initialDelay: number
    maxDelay: number
  }
  
  // Connection pool
  pool: {
    min: number
    max: number
    acquireTimeout: number
  }
  
  // Error handling
  errorHandler?: (err: Error) => void
}

// Redis client type
export type RedisClient = Redis

// Rate limit info
export interface RateLimitInfo {
  userId: string
  count: number
  window: number
  limit: number
  remaining: number
  reset: number
}

// Redis operations result
export interface RedisOperationResult<T> {
  success: boolean
  data?: T
  error?: Error
  timestamp: number
}

// Redis key patterns
export const REDIS_KEYS = {
  message: (userId: string) => `chat:${userId}:last`,
  rateLimit: (userId: string) => `rate:${userId}`,
  activity: (userId: string) => `activity:${userId}`,
  conversation: (userId: string, conversationId: string) => `conv:${userId}:${conversationId}`
} as const

// Default configuration
export const DEFAULT_REDIS_CONFIG: RedisConfig = {
  host: 'localhost',
  port: 6379,
  keyPrefix: 'chat:',
  ttl: {
    active: 24 * 60 * 60,    // 24 hours
    inactive: 1 * 60 * 60     // 1 hour
  },
  rateLimit: {
    perUser: 30,
    global: 10000,
    window: 60
  }
}

// Default options
export const DEFAULT_REDIS_OPTIONS: RedisOptions = {
  retry: {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 2000
  },
  pool: {
    min: 5,
    max: 20,
    acquireTimeout: 5000
  }
}
