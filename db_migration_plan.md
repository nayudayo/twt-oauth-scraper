# Database Migration Plan: SQLite to PostgreSQL

## Migration Checklist

### Phase 1: Setup and Preparation
- [ ] Install PostgreSQL Dependencies
  ```bash
  npm install pg pg-pool
  npm install -D @types/pg
  ```
- [ ] Create Migration Environment File
  ```env
  # .env.migration
  SQLITE_PATH=./data/twitter.db
  PG_USER=twitter_analysis
  PG_PASSWORD=secure_password
  PG_DATABASE=twitter_analysis_db
  PG_HOST=localhost
  PG_PORT=5432
  ```
- [ ] Create PostgreSQL Schema
  - [ ] Create base tables
  - [ ] Create analysis queue tables
  - [ ] Create indexes
  - [ ] Verify schema creation

### Phase 2: Data Migration Script Development
- [ ] Create migration script file
- [ ] Implement user migration
- [ ] Implement tweets migration with batching
- [ ] Implement analysis queue migration
- [ ] Implement analysis chunks migration
- [ ] Add error handling and rollback
- [ ] Add progress logging
- [ ] Test script with sample data

### Phase 3: Code Updates
- [ ] Create Database Adapter Interface
- [ ] Implement PostgreSQL Adapter
- [ ] Update Factory Method
- [ ] Add connection pooling
- [ ] Implement fallback mechanism
- [ ] Update all database queries
- [ ] Add error handling

### Phase 4: Testing and Verification
- [ ] Create Data Integrity Tests
  - [ ] Compare record counts
  - [ ] Verify data samples
  - [ ] Test all queries
- [ ] Create Performance Tests
  - [ ] Measure query times
  - [ ] Test concurrent operations
  - [ ] Verify connection pool behavior
- [ ] Create Rollback Tests
  - [ ] Test SQLite fallback
  - [ ] Test data export
  - [ ] Verify data integrity after rollback

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
PG_USER=twitter_analysis
PG_PASSWORD=secure_password
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

3. **Update Factory Method**
```typescript
// src/lib/db/index.ts
export function createDbAdapter(): DatabaseAdapter {
  if (process.env.DB_TYPE === 'postgres') {
    return new PostgresAdapter();
  }
  return new SQLiteAdapter(); // fallback
}
```

### Phase 4: Testing and Verification

1. **Data Integrity Tests**
```typescript
async function verifyMigration() {
  // Compare record counts
  // Verify data samples
  // Test all queries
}
```

2. **Performance Tests**
```typescript
async function testPerformance() {
  // Measure query times
  // Test concurrent operations
  // Verify connection pool behavior
}
```

## Rollback Plan

1. **Keep SQLite as Fallback**
```typescript
if (!postgresAvailable()) {
  return initSQLiteDB();
}
```

2. **Data Export Script**
```typescript
async function exportToSQLite() {
  // Export PostgreSQL data back to SQLite
}
```

## Migration Execution Steps

1. **Preparation**
   - Install PostgreSQL
   - Create new database
   - Run schema creation script
   - Test connection

2. **Migration**
   - Stop application
   - Run migration script
   - Verify data integrity
   - Update application code
   - Test thoroughly

3. **Post-Migration**
   - Monitor performance
   - Keep SQLite backup for 1 week
   - Update documentation

## Timeline

1. **Day 1**: Setup and schema creation
2. **Day 2**: Migration script development and testing
3. **Day 3**: Code updates and adapter implementation
4. **Day 4**: Testing and verification
5. **Day 5**: Production migration and monitoring

## Success Criteria

1. All data successfully migrated
2. No loss of functionality
3. Equal or better performance
4. Zero downtime during switch
5. Working rollback capability 