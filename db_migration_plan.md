# Database Migration Plan: SQLite to PostgreSQL

## Migration Checklist

### Phase 1: Setup and Preparation ✅
- [x] Install PostgreSQL Dependencies
  ```bash
  npm install pg pg-pool
  npm install -D @types/pg
  ```
- [x] Create Migration Environment File
  ```env
  # .env.migration
  SQLITE_PATH=./data/twitter.db
  PG_USER=postgres
  PG_PASSWORD=your_password
  PG_DATABASE=twitter_analysis_db
  PG_HOST=localhost
  PG_PORT=5432
  ```
- [x] Create PostgreSQL Database
  ```bash
  createdb -U postgres twitter_analysis_db
  ```
- [x] Create PostgreSQL Schema
  - [x] Create base tables
  - [x] Create analysis queue tables
  - [x] Create indexes
  - [x] Verify schema creation

### Phase 2: Data Migration Script Development ✅
- [x] Create migration script file
- [x] Implement user migration
- [x] Implement tweets migration with batching
- [x] Implement analysis queue migration
- [x] Implement analysis chunks migration
- [x] Add error handling and rollback
- [x] Add progress logging
- [x] Test script with sample data
  - [x] Test data setup
  - [x] Migration execution
  - [x] Data integrity verification
  - [x] All checks passed

### Phase 3: Code Updates 🔄
- [ ] Create Database Adapter Interface
  - [ ] Define base types and interfaces
    - [x] User types with JSONB support
    - [x] Tweet types with JSONB metadata
    - [x] Analysis types with JSONB fields
    - [x] Funnel types with JSONB storage
    - [x] Referral types with proper constraints
  - [ ] Define core operations
    - [x] User operations (create, read, update) with JSONB handling
      - [x] Profile management with JSONB fields
      - [x] Username validation
      - [x] User search functionality
    - [x] Tweet operations (save, get, batch) with text search
      - [x] Full-text search using GIN indexes
      - [x] Batch operations with pagination
      - [x] Date range filtering
      - [x] Reply filtering
    - [x] Analysis operations (save, get latest) with transactions
      - [x] Job management with status tracking
      - [x] Chunk processing with JSONB results
      - [x] Progress tracking with atomic updates
    - [x] Funnel operations (progress, completion) with atomic updates
      - [x] Progress tracking with JSONB
      - [x] Command response storage
      - [x] Completion statistics
    - [x] Referral operations (tracking, usage) with foreign key constraints
      - [x] Code validation with constraints
      - [x] Usage tracking with foreign keys
      - [x] Referral statistics
      - [x] Transaction-safe tracking
    - [x] Common operations
      - [x] Transaction support
      - [x] Health checking
      - [x] Database maintenance (vacuum, analyze)
  - [x] Add transaction support interface
    - [x] Begin transaction with proper isolation levels
    - [x] Commit transaction with error handling
    - [x] Rollback transaction with proper cleanup
  - [x] Add connection management interface
    - [x] Connect method with retry logic
    - [x] Disconnect method with proper cleanup
    - [x] Connection status check with health monitoring

- [ ] Implement PostgreSQL Adapter (Primary Database)
  - [x] Setup connection management
    - [x] Connection pool configuration with optimal settings
    - [x] Health checks with automatic recovery
    - [x] Reconnection logic with exponential backoff
    - [x] Connection string management with environment variables
  - [x] Implement CRUD operations
    - [x] User operations with JSONB validation
      - [x] Profile management with JSONB fields
      - [x] Username validation
      - [x] User search functionality
    - [x] Tweet operations with GIN index utilization
      - [x] Bulk operations with UNNEST
      - [x] Full-text search with ranking
      - [x] JSONB metadata handling
      - [x] Efficient batching
    - [x] Analysis operations with proper transaction isolation
      - [x] Job management with status tracking
      - [x] Chunk processing with JSONB results
      - [x] Progress tracking with atomic updates
    - [x] Funnel operations with JSONB operators
      - [x] Progress tracking with JSONB
      - [x] Command response storage
      - [x] Completion statistics
      - [x] Atomic updates with JSONB concatenation
    - [x] Referral operations with constraint handling
      - [x] Code validation with constraints
      - [x] Usage tracking with foreign keys
      - [x] Referral statistics
      - [x] Transaction-safe tracking
  - [x] Add error handling
    - [x] PostgreSQL-specific error codes
    - [x] Connection error recovery
    - [x] Query error mapping
    - [x] Transaction error handling
    - [x] Custom error types with PostgreSQL details
  - [ ] Add logging and monitoring
    - [x] Query performance logging with explain plans
      - [x] Track query duration
      - [x] Log slow queries
      - [x] Monitor query parameters
      - [x] Track query patterns
    - [x] Connection pool metrics
      - [x] Track total connections
      - [x] Monitor active/idle connections
      - [x] Track connection timeouts
      - [x] Monitor pool utilization
    - [x] Transaction monitoring
      - [x] Track transaction duration
      - [x] Monitor transaction operations
      - [x] Track transaction status
      - [x] Log long-running transactions
    - [x] Error tracking with proper context
      - [x] Track query errors
      - [x] Track transaction errors
      - [x] Track connection errors
      - [x] Provide error context

- [ ] Update Database Factory
  - [x] Make PostgreSQL the default database
  - [x] Add configuration validation
    - [x] Connection string parsing
    - [x] Individual parameter validation
    - [x] Pool configuration validation
  - [x] Add environment variable validation
  - [x] Add type-safe configuration
    - [x] Strong typing for config options
    - [x] Runtime validation
    - [x] Error handling
  - [x] Add connection management
    - [x] Implement optimal pool size calculation
      - [x] Based on CPU cores
      - [x] Based on available memory
      - [x] Dynamic adjustment
    - [x] Add connection timeouts with retry logic
      - [x] Exponential backoff
      - [x] Maximum retry attempts
      - [x] Connection validation
    - [x] Add connection validation on borrow
      - [x] Health check queries
      - [x] Automatic cleanup
      - [x] Error handling
    - [x] Add idle connection cleanup
      - [x] Periodic cleanup
      - [x] Minimum connections
      - [x] Maximum idle time
    - [x] Add pool overflow handling
      - [x] Maximum connections
      - [x] Wait queue
      - [x] Timeout handling

- [ ] Configure Connection Pooling
  - [x] Implement optimal pool size calculation
    - [x] Based on CPU cores
    - [x] Based on available memory
    - [x] Configurable limits
  - [x] Add connection timeouts with retry logic
    - [x] Exponential backoff
    - [x] Maximum retry attempts
    - [x] Connection validation
  - [x] Add connection validation on borrow
    - [x] Health check queries
    - [x] Automatic cleanup
    - [x] Error handling
  - [x] Add idle connection cleanup
    - [x] Periodic cleanup
    - [x] Minimum connections
    - [x] Maximum idle time
  - [x] Add pool overflow handling
    - [x] Maximum connections
    - [x] Wait queue
    - [x] Timeout handling

- [ ] Implement SQLite Adapter (Emergency Fallback)
  - [ ] Port existing SQLite code to new interface
  - [ ] Add JSONB emulation layer
  - [ ] Ensure data type compatibility
  - [ ] Add proper error mapping
  - [ ] Add performance warnings

- [ ] Update Application Code
  - [x] Replace SQLite-specific code
    - [x] Create new database entry point
    - [x] Add environment variable configuration
    - [x] Add singleton instance management
    - [x] Add proper initialization flow
  - [x] Update JSONB handling
    - [x] Use native JSONB operations
    - [x] Add type safety for JSON fields
    - [x] Handle null/undefined values
  - [x] Add PostgreSQL-specific optimizations
    - [x] Use connection pooling
    - [x] Use prepared statements
    - [x] Use JSONB operators
  - [x] Update error handling
    - [x] Add PostgreSQL-specific error codes
    - [x] Add connection error handling
    - [x] Add transaction error handling
  - [x] Add performance monitoring
    - [x] Add query logging
      - [x] Track query duration
      - [x] Log slow queries
      - [x] Track query patterns
    - [x] Add connection pool metrics
      - [x] Track total connections
      - [x] Track active/idle connections
      - [x] Monitor wait times
    - [x] Add transaction monitoring
      - [x] Track transaction duration
      - [x] Monitor transaction operations
      - [x] Track transaction status

- [ ] Add Production Monitoring
  - [ ] Add query performance logging
    - [ ] Log slow queries to external service
    - [ ] Track query patterns over time
    - [ ] Monitor index usage statistics
  - [ ] Add connection pool monitoring
    - [ ] Track pool utilization trends
    - [ ] Set up alerts for pool exhaustion
    - [ ] Monitor connection lifetimes
  - [ ] Add transaction monitoring
    - [ ] Track transaction throughput
    - [ ] Monitor deadlock patterns
    - [ ] Alert on transaction anomalies
  - [ ] Add error tracking
    - [ ] Integrate with error tracking service
    - [ ] Set up error alerting rules
    - [ ] Track error patterns
  - [ ] Add performance metrics
    - [ ] Export metrics to monitoring service
    - [ ] Create performance dashboards
    - [ ] Set up performance alerts

### Phase 4: Testing and Verification
- [ ] Create Data Integrity Tests
  - [ ] Compare record counts
  - [ ] Verify JSONB data integrity
  - [ ] Test all queries with explain plans
  - [ ] Verify constraint enforcement
  - [ ] Test concurrent operations
- [ ] Create Performance Tests
  - [ ] Measure query times with different loads
  - [ ] Test connection pool behavior
  - [ ] Test transaction isolation levels
  - [ ] Test concurrent write operations
  - [ ] Test JSONB query performance
- [ ] Create Rollback Tests
  - [ ] Test emergency SQLite fallback
  - [ ] Test data export with JSONB
  - [ ] Verify constraint preservation
  - [ ] Test type compatibility
  - [ ] Verify index utilization

### Phase 5: Production Migration
- [ ] Backup Current Database
- [ ] Stop Application
- [ ] Run Migration Script
- [ ] Verify Data Integrity
- [ ] Update Application Code
- [ ] Run All Tests
- [ ] Deploy Updates
- [ ] Monitor Performance
- [ ] Keep SQLite Backup for 1 Week
- [ ] Update Documentation

## Success Criteria
- [ ] All data successfully migrated
- [ ] No loss of functionality
- [ ] Equal or better performance
- [ ] Zero downtime during switch
- [ ] Working rollback capability

## Schema Details

### Existing Tables
1. `users`
2. `tweets`
3. `personality_analysis`
4. `funnel_progress`
5. `funnel_completion`
6. `referral_tracking`
7. `referral_codes`
8. `referral_usage_log`

## Migration Strategy

### Phase 1: Setup and Preparation

1. **Install PostgreSQL Dependencies**
```bash
npm install pg pg-pool
npm install -D @types/pg
```

2. **Create Migration Environment File**
```env
# .env.migration
SQLITE_PATH=./data/twitter.db
PG_USER=postgres
PG_PASSWORD=your_password
PG_DATABASE=twitter_analysis_db
PG_HOST=localhost
PG_PORT=5432
```

3. **Create PostgreSQL Schema**
```sql
-- Schema with equivalent SQLite tables but with PostgreSQL optimizations
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    profile_data JSONB,
    profile_picture_url TEXT,
    last_scraped TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tweets (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    url TEXT,
    is_reply BOOLEAN,
    metadata JSONB,
    created_in_db TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE personality_analysis (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    traits JSONB NOT NULL,
    interests JSONB NOT NULL,
    communication_style JSONB NOT NULL,
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE funnel_progress (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id),
    current_command_index INTEGER DEFAULT 0,
    completed_commands JSONB DEFAULT '[]'::jsonb,
    command_responses JSONB DEFAULT '{}'::jsonb,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE funnel_completion (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completion_data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE referral_tracking (
    id SERIAL PRIMARY KEY,
    referral_code VARCHAR(255) NOT NULL,
    referrer_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    referred_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(referred_user_id)
);

CREATE TABLE referral_codes (
    code VARCHAR(255) PRIMARY KEY,
    owner_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE referral_usage_log (
    id SERIAL PRIMARY KEY,
    referral_code VARCHAR(255) NOT NULL REFERENCES referral_codes(code),
    used_by_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Analysis Queue Management Tables
CREATE TABLE analysis_queue (
    job_id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    total_chunks INTEGER NOT NULL,
    processed_chunks INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE TABLE analysis_chunks (
    chunk_id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES analysis_queue(job_id),
    chunk_index INTEGER NOT NULL,
    tweet_count INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    result JSONB,
    error TEXT,
    CONSTRAINT valid_chunk_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Indexes (optimized for PostgreSQL)
CREATE INDEX idx_tweets_user_created ON tweets(user_id, created_at);
CREATE INDEX idx_tweets_created ON tweets(created_at);
CREATE INDEX idx_tweets_text ON tweets USING gin (to_tsvector('english', text));
CREATE INDEX idx_referral_tracking_code ON referral_tracking(referral_code);
CREATE INDEX idx_referral_tracking_referrer ON referral_tracking(referrer_user_id);
CREATE INDEX idx_referral_codes_owner ON referral_codes(owner_user_id);
CREATE INDEX idx_referral_usage_code ON referral_usage_log(referral_code);

-- Additional indexes for analysis tables
CREATE INDEX idx_analysis_queue_status ON analysis_queue(status);
CREATE INDEX idx_analysis_queue_user ON analysis_queue(user_id);
CREATE INDEX idx_analysis_chunks_job_status ON analysis_chunks(job_id, status);
CREATE INDEX idx_analysis_queue_priority ON analysis_queue(priority DESC, created_at ASC);
```

### Phase 2: Data Migration Script

```typescript
// src/scripts/migrate-to-postgres.ts
import { Pool } from 'pg';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';

// Load migration environment variables
dotenv.config({ path: '.env.migration' });

async function migrateTables() {
  // Initialize connections
  const pgPool = new Pool({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    port: parseInt(process.env.PG_PORT || '5432')
  });

  const sqliteDb = await open({
    filename: process.env.SQLITE_PATH!,
    driver: sqlite3.Database
  });

  try {
    // Start transaction
    const pgClient = await pgPool.connect();
    await pgClient.query('BEGIN');

    // 1. Migrate users
    const users = await sqliteDb.all('SELECT * FROM users');
    for (const user of users) {
      await pgClient.query(
        'INSERT INTO users (id, username, profile_data, profile_picture_url, last_scraped, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [user.id, user.username, user.profile_data, user.profile_picture_url, user.last_scraped, user.created_at]
      );
    }

    // 2. Migrate tweets (in batches)
    const BATCH_SIZE = 1000;
    let offset = 0;
    while (true) {
      const tweets = await sqliteDb.all('SELECT * FROM tweets LIMIT $1 OFFSET $2', BATCH_SIZE, offset);
      if (tweets.length === 0) break;
      
      for (const tweet of tweets) {
        await pgClient.query(
          'INSERT INTO tweets (id, user_id, text, created_at, url, is_reply, metadata, created_in_db) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [tweet.id, tweet.user_id, tweet.text, tweet.created_at, tweet.url, tweet.is_reply, tweet.metadata, tweet.created_in_db]
        );
      }
      
      offset += BATCH_SIZE;
    }

    // Migrate analysis queue data if exists
    const analysisJobs = await sqliteDb.all('SELECT * FROM analysis_queue');
    for (const job of analysisJobs) {
      await pgClient.query(
        `INSERT INTO analysis_queue 
         (job_id, user_id, status, priority, total_chunks, processed_chunks, 
          created_at, started_at, completed_at, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [job.job_id, job.user_id, job.status, job.priority, job.total_chunks,
         job.processed_chunks, job.created_at, job.started_at, job.completed_at, job.error]
      );
    }

    // Migrate analysis chunks data if exists
    const analysisChunks = await sqliteDb.all('SELECT * FROM analysis_chunks');
    for (const chunk of analysisChunks) {
      await pgClient.query(
        `INSERT INTO analysis_chunks 
         (chunk_id, job_id, chunk_index, tweet_count, status,
          started_at, completed_at, result, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [chunk.chunk_id, chunk.job_id, chunk.chunk_index, chunk.tweet_count,
         chunk.status, chunk.started_at, chunk.completed_at, chunk.result, chunk.error]
      );
    }

    // Continue with other tables...
    await pgClient.query('COMMIT');
  } catch (error) {
    console.error('Migration failed:', error);
    await pgPool.query('ROLLBACK');
    throw error;
  } finally {
    await pgPool.end();
    await sqliteDb.close();
  }
}
```

### Phase 3: Code Updates

1. **Create Database Adapter Interface**
```typescript
// src/lib/db/types.ts
export interface DatabaseAdapter {
  saveUserProfile(username: string, profile: TwitterProfile): Promise<void>;
  saveTweets(userId: string, tweets: Tweet[]): Promise<void>;
  getUserTweets(username: string): Promise<Tweet[]>;
  // ... other methods
}
```

2. **Create PostgreSQL Implementation**
```typescript
// src/lib/db/postgres.ts
export class PostgresAdapter implements DatabaseAdapter {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      // connection config
    });
  }

  async saveUserProfile(username: string, profile: TwitterProfile) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Implementation
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ... other methods
}
```