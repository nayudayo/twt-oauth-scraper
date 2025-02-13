import pg from 'pg';
import dotenv from 'dotenv';
import readline from 'readline';

const { Pool } = pg;

// Load environment variables
dotenv.config();

async function purgeDatabase() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Ask for confirmation with proper typing
    const answer = await new Promise<string>(resolve => {
      rl.question('\n⚠️  WARNING: This will delete all data in the database. Are you sure? (yes/no): ', resolve);
    });

    if (answer.toLowerCase() !== 'yes') {
      console.log('Operation cancelled.');
      process.exit(0);
    }

    // Initialize PostgreSQL connection
    const pool = new Pool({
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      host: process.env.PG_HOST,
      database: process.env.PG_DATABASE,
      port: parseInt(process.env.PG_PORT || '5432')
    });

    console.log('\nConnecting to database...');

    // Drop all tables in the correct order (respecting foreign key constraints)
    const dropTables = `
      DROP TABLE IF EXISTS referral_usage_log CASCADE;
      DROP TABLE IF EXISTS referral_tracking CASCADE;
      DROP TABLE IF EXISTS referral_codes CASCADE;
      DROP TABLE IF EXISTS funnel_completion CASCADE;
      DROP TABLE IF EXISTS funnel_progress CASCADE;
      DROP TABLE IF EXISTS analysis_chunks CASCADE;
      DROP TABLE IF EXISTS analysis_queue CASCADE;
      DROP TABLE IF EXISTS personality_analysis CASCADE;
      DROP TABLE IF EXISTS tweets CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `;

    console.log('Dropping all tables...');
    await pool.query(dropTables);
    console.log('✅ All tables dropped successfully');

    // Recreate tables
    const createTables = `
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

      CREATE TABLE referral_codes (
        code VARCHAR(255) PRIMARY KEY,
        owner_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE referral_tracking (
        id SERIAL PRIMARY KEY,
        referral_code VARCHAR(255) NOT NULL,
        referrer_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        referred_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(referred_user_id)
      );

      CREATE TABLE referral_usage_log (
        id SERIAL PRIMARY KEY,
        referral_code VARCHAR(255) NOT NULL REFERENCES referral_codes(code),
        used_by_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

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

      -- Create indexes
      CREATE INDEX idx_tweets_user_created ON tweets(user_id, created_at);
      CREATE INDEX idx_tweets_created ON tweets(created_at);
      CREATE INDEX idx_tweets_text ON tweets USING gin (to_tsvector('english', text));
      CREATE INDEX idx_referral_tracking_code ON referral_tracking(referral_code);
      CREATE INDEX idx_referral_tracking_referrer ON referral_tracking(referrer_user_id);
      CREATE INDEX idx_referral_codes_owner ON referral_codes(owner_user_id);
      CREATE INDEX idx_referral_usage_code ON referral_usage_log(referral_code);
      CREATE INDEX idx_analysis_queue_status ON analysis_queue(status);
      CREATE INDEX idx_analysis_queue_user ON analysis_queue(user_id);
      CREATE INDEX idx_analysis_chunks_job_status ON analysis_chunks(job_id, status);
      CREATE INDEX idx_analysis_queue_priority ON analysis_queue(priority DESC, created_at ASC);
    `;

    console.log('Recreating tables...');
    await pool.query(createTables);
    console.log('✅ All tables recreated successfully');

    await pool.end();
    console.log('\n✨ Database purged and reinitialized successfully!');
  } catch (error) {
    console.error('Error purging database:', error);
  } finally {
    rl.close();
  }
}

// Run the purge
purgeDatabase(); 