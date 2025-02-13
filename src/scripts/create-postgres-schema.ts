import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load migration environment variables
dotenv.config({ path: '.env.migration' });

async function createSchema() {
  console.log('Starting PostgreSQL schema creation...');
  
  // Use connection string instead of object configuration
  const connectionString = `postgresql://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}`;
  const pgPool = new Pool({ connectionString });

  try {
    const client = await pgPool.connect();
    console.log('Connected to PostgreSQL');

    try {
      await client.query('BEGIN');

      // Base Tables
      console.log('Creating base tables...');
      
      await client.query(`
        CREATE TABLE users (
          id VARCHAR(255) PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          twitter_username VARCHAR(255) UNIQUE,
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
      `);
      console.log('Base tables created successfully');

      // Analysis Queue Tables
      console.log('Creating analysis queue tables...');
      await client.query(`
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
      `);
      console.log('Analysis queue tables created successfully');

      // Indexes
      console.log('Creating indexes...');
      await client.query(`
        -- Base table indexes
        CREATE INDEX idx_tweets_user_created ON tweets(user_id, created_at);
        CREATE INDEX idx_tweets_created ON tweets(created_at);
        CREATE INDEX idx_tweets_text ON tweets USING gin (to_tsvector('english', text));
        CREATE INDEX idx_referral_tracking_code ON referral_tracking(referral_code);
        CREATE INDEX idx_referral_tracking_referrer ON referral_tracking(referrer_user_id);
        CREATE INDEX idx_referral_codes_owner ON referral_codes(owner_user_id);
        CREATE INDEX idx_referral_usage_code ON referral_usage_log(referral_code);

        -- Analysis queue indexes
        CREATE INDEX idx_analysis_queue_status ON analysis_queue(status);
        CREATE INDEX idx_analysis_queue_user ON analysis_queue(user_id);
        CREATE INDEX idx_analysis_chunks_job_status ON analysis_chunks(job_id, status);
        CREATE INDEX idx_analysis_queue_priority ON analysis_queue(priority DESC, created_at ASC);
      `);
      console.log('Indexes created successfully');

      await client.query('COMMIT');
      console.log('Schema creation completed successfully!');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Schema creation failed:', error);
    throw error;
  } finally {
    await pgPool.end();
  }
}

// Execute schema creation
createSchema().catch(error => {
  console.error('Schema creation script failed:', error);
  process.exit(1);
}); 