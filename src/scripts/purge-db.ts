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
      DROP TABLE IF EXISTS funnel_progress CASCADE;
      DROP TABLE IF EXISTS analysis_chunks CASCADE;
      DROP TABLE IF EXISTS analysis_queue CASCADE;
      DROP TABLE IF EXISTS personality_cache CASCADE;
      DROP TABLE IF EXISTS personality_analysis CASCADE;
      DROP TABLE IF EXISTS analytics_results CASCADE;
      DROP TABLE IF EXISTS tweets CASCADE;
      DROP TABLE IF EXISTS access_codes CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS conversations CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS personality_traits CASCADE;
      DROP TABLE IF EXISTS personality_interests CASCADE;
      DROP TABLE IF EXISTS personality_communication_styles CASCADE;
      DROP TABLE IF EXISTS personality_thought_processes CASCADE;
      DROP TABLE IF EXISTS personality_emotional_tones CASCADE;
      DROP TABLE IF EXISTS personality_topics_themes CASCADE;
      DROP TABLE IF EXISTS personality_analysis_results CASCADE;
      DROP TABLE IF EXISTS personality_analysis_queue CASCADE;
      DROP TABLE IF EXISTS personality_analysis_chunks CASCADE;
      DROP TABLE IF EXISTS personality_analysis_cache CASCADE;
      DROP TABLE IF EXISTS personality_analysis_logs CASCADE;
      DROP TABLE IF EXISTS personality_analysis_metrics CASCADE;
      DROP TABLE IF EXISTS personality_analysis_feedback CASCADE;
      DROP TABLE IF EXISTS personality_analysis_reports CASCADE;
    `;

    console.log('Dropping all tables...');
    await pool.query(dropTables);
    console.log('✅ All tables dropped successfully');

    // Recreate tables
    const createTables = `
      -- Create custom types first
      DROP TYPE IF EXISTS CommunicationLevel CASCADE;
      CREATE TYPE CommunicationLevel AS ENUM ('low', 'medium', 'high');

      CREATE TABLE users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        twitter_username VARCHAR(255) UNIQUE,
        profile_data JSONB,
        profile_picture_url TEXT,
        last_scraped TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_scrape_time TIMESTAMP WITH TIME ZONE,
        last_analysis_time TIMESTAMP WITH TIME ZONE,
        scrape_cooldown_minutes INTEGER DEFAULT 60,
        analysis_cooldown_minutes INTEGER DEFAULT 60
      );

      CREATE TABLE access_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        user_id VARCHAR(255) REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB DEFAULT '{}'::jsonb
      );

      CREATE TABLE tweets (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        text TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        url TEXT,
        is_reply BOOLEAN,
        view_count INTEGER DEFAULT 0,
        retweet_count INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        quote_count INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_in_db TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_cache (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        analysis_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        version INTEGER DEFAULT 1,
        is_stale BOOLEAN DEFAULT false,
        UNIQUE(user_id)
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

      CREATE TABLE conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        title VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'     -- For active status and other metadata
      );

      CREATE TABLE messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        role VARCHAR(50) NOT NULL,      -- 'user' or 'assistant'
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'     -- For future extensibility
      );

      CREATE TABLE analytics_results (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        metric_type VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_metric_type CHECK (metric_type IN ('engagement', 'quality', 'visibility', 'virality', 'all')),
        UNIQUE(user_id, metric_type)
      );

      CREATE TABLE personality_traits (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        trait_name VARCHAR(255) NOT NULL,
        trait_score INTEGER NOT NULL,
        trait_explanation TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_interests (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        interest_name VARCHAR(255) NOT NULL,
        interest_weight INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_communication_styles (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        formality CommunicationLevel NOT NULL,
        enthusiasm CommunicationLevel NOT NULL,
        technical_level CommunicationLevel NOT NULL,
        emoji_usage CommunicationLevel NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_thought_processes (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        initial_approach TEXT,
        processing_style TEXT,
        expression_style TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_emotional_tones (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        tone_description TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_topics_themes (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        topic TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_analysis_results (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        summary TEXT NOT NULL,
        traits_id INTEGER REFERENCES personality_traits(id),
        interests_id INTEGER REFERENCES personality_interests(id),
        communication_style_id INTEGER REFERENCES personality_communication_styles(id),
        thought_process_id INTEGER REFERENCES personality_thought_processes(id),
        emotional_tone_id INTEGER REFERENCES personality_emotional_tones(id),
        topics_themes_id INTEGER REFERENCES personality_topics_themes(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_analysis_queue (
        id SERIAL PRIMARY KEY,
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

      CREATE TABLE personality_analysis_chunks (
        id SERIAL PRIMARY KEY,
        queue_id INTEGER REFERENCES personality_analysis_queue(id),
        chunk_index INTEGER NOT NULL,
        tweet_count INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        result JSONB,
        error TEXT,
        CONSTRAINT valid_chunk_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
      );

      CREATE TABLE personality_analysis_cache (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        analysis_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        version INTEGER DEFAULT 1,
        is_stale BOOLEAN DEFAULT false,
        UNIQUE(user_id)
      );

      CREATE TABLE personality_analysis_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_analysis_metrics (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        metric_type VARCHAR(50) NOT NULL,
        metric_value JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_analysis_feedback (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        feedback_type VARCHAR(50) NOT NULL,
        feedback_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personality_analysis_reports (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        report_type VARCHAR(50) NOT NULL,
        report_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
      CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX idx_messages_created ON messages(created_at ASC);
      CREATE INDEX idx_tweets_user_created ON tweets(user_id, created_at);
      CREATE INDEX idx_tweets_created ON tweets(created_at);
      CREATE INDEX idx_tweets_text ON tweets USING gin (to_tsvector('english', text));
      CREATE INDEX idx_tweets_view_count ON tweets(view_count DESC);
      CREATE INDEX idx_tweets_engagement ON tweets(like_count DESC, retweet_count DESC);
      CREATE INDEX idx_referral_tracking_code ON referral_tracking(referral_code);
      CREATE INDEX idx_referral_tracking_referrer ON referral_tracking(referrer_user_id);
      CREATE INDEX idx_referral_codes_owner ON referral_codes(owner_user_id);
      CREATE INDEX idx_referral_usage_code ON referral_usage_log(referral_code);
      CREATE INDEX idx_analysis_queue_status ON analysis_queue(status);
      CREATE INDEX idx_analysis_queue_user ON analysis_queue(user_id);
      CREATE INDEX idx_analysis_chunks_job_status ON analysis_chunks(job_id, status);
      CREATE INDEX idx_analysis_queue_priority ON analysis_queue(priority DESC, created_at ASC);
      CREATE INDEX idx_access_codes_code ON access_codes(code);
      CREATE INDEX idx_access_codes_user_id ON access_codes(user_id);
      CREATE INDEX idx_access_codes_is_active ON access_codes(is_active);
      CREATE INDEX idx_users_last_scrape_time ON users(last_scrape_time);
      CREATE INDEX idx_users_last_analysis_time ON users(last_analysis_time);
      
      -- Personality cache indexes
      CREATE INDEX idx_personality_cache_user ON personality_cache(user_id);
      CREATE INDEX idx_personality_cache_updated ON personality_cache(updated_at DESC);
      CREATE INDEX idx_personality_cache_version ON personality_cache(version);
      CREATE INDEX idx_personality_cache_stale ON personality_cache(is_stale);

      -- Add index for analytics results
      CREATE INDEX idx_analytics_results_user ON analytics_results(user_id);
      CREATE INDEX idx_analytics_results_type ON analytics_results(metric_type);
      CREATE INDEX idx_analytics_results_updated ON analytics_results(updated_at DESC);

      -- Add new indexes for personality analysis tables
      CREATE INDEX idx_personality_traits_user ON personality_traits(user_id);
      CREATE INDEX idx_personality_interests_user ON personality_interests(user_id);
      CREATE INDEX idx_personality_communication_styles_user ON personality_communication_styles(user_id);
      CREATE INDEX idx_personality_thought_processes_user ON personality_thought_processes(user_id);
      CREATE INDEX idx_personality_emotional_tones_user ON personality_emotional_tones(user_id);
      CREATE INDEX idx_personality_topics_themes_user ON personality_topics_themes(user_id);
      CREATE INDEX idx_personality_analysis_results_user ON personality_analysis_results(user_id);
      CREATE INDEX idx_personality_analysis_queue_status ON personality_analysis_queue(status);
      CREATE INDEX idx_personality_analysis_queue_user ON personality_analysis_queue(user_id);
      CREATE INDEX idx_personality_analysis_chunks_queue ON personality_analysis_chunks(queue_id);
      CREATE INDEX idx_personality_analysis_cache_user ON personality_analysis_cache(user_id);
      CREATE INDEX idx_personality_analysis_cache_stale ON personality_analysis_cache(is_stale);
      CREATE INDEX idx_personality_analysis_logs_user ON personality_analysis_logs(user_id);
      CREATE INDEX idx_personality_analysis_metrics_user ON personality_analysis_metrics(user_id);
      CREATE INDEX idx_personality_analysis_feedback_user ON personality_analysis_feedback(user_id);
      CREATE INDEX idx_personality_analysis_reports_user ON personality_analysis_reports(user_id);

      -- Add indexes for timestamp columns
      CREATE INDEX idx_personality_traits_updated ON personality_traits(updated_at DESC);
      CREATE INDEX idx_personality_interests_updated ON personality_interests(updated_at DESC);
      CREATE INDEX idx_personality_communication_styles_updated ON personality_communication_styles(updated_at DESC);
      CREATE INDEX idx_personality_thought_processes_updated ON personality_thought_processes(updated_at DESC);
      CREATE INDEX idx_personality_emotional_tones_updated ON personality_emotional_tones(updated_at DESC);
      CREATE INDEX idx_personality_topics_themes_updated ON personality_topics_themes(updated_at DESC);
      CREATE INDEX idx_personality_analysis_results_updated ON personality_analysis_results(updated_at DESC);
      CREATE INDEX idx_personality_analysis_queue_created ON personality_analysis_queue(created_at DESC);
      CREATE INDEX idx_personality_analysis_cache_updated ON personality_analysis_cache(updated_at DESC);
      CREATE INDEX idx_personality_analysis_metrics_updated ON personality_analysis_metrics(updated_at DESC);
      CREATE INDEX idx_personality_analysis_reports_updated ON personality_analysis_reports(updated_at DESC);
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