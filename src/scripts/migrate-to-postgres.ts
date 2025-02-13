import { Pool } from 'pg';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';

// Load migration environment variables
dotenv.config({ path: '.env.migration' });

async function migrateTables() {
  console.log('Starting database migration...');
  
  // Initialize connections
  const pgPool = new Pool({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    port: parseInt(process.env.PG_PORT || '5432')
  });

  console.log('Connecting to SQLite database...');
  const sqliteDb = await open({
    filename: process.env.SQLITE_PATH!,
    driver: sqlite3.Database
  });

  try {
    // Start transaction
    console.log('Starting PostgreSQL transaction...');
    const pgClient = await pgPool.connect();
    await pgClient.query('BEGIN');

    // 1. Migrate users
    console.log('Migrating users table...');
    const users = await sqliteDb.all('SELECT * FROM users');
    console.log(`Found ${users.length} users to migrate`);
    
    for (const user of users) {
      await pgClient.query(
        'INSERT INTO users (id, username, profile_data, profile_picture_url, last_scraped, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [user.id, user.username, user.profile_data, user.profile_picture_url, user.last_scraped, user.created_at]
      );
    }
    console.log('Users migration complete');

    // 2. Migrate tweets (in batches)
    console.log('Starting tweets migration...');
    const BATCH_SIZE = 1000;
    let offset = 0;
    let totalTweets = 0;
    
    while (true) {
      const tweets = await sqliteDb.all('SELECT * FROM tweets LIMIT ? OFFSET ?', [BATCH_SIZE, offset]);
      if (tweets.length === 0) break;
      
      console.log(`Processing batch of ${tweets.length} tweets at offset ${offset}`);
      for (const tweet of tweets) {
        await pgClient.query(
          'INSERT INTO tweets (id, user_id, text, created_at, url, is_reply, metadata, created_in_db) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [tweet.id, tweet.user_id, tweet.text, tweet.created_at, tweet.url, tweet.is_reply, tweet.metadata, tweet.created_in_db]
        );
      }
      
      totalTweets += tweets.length;
      offset += BATCH_SIZE;
      console.log(`Migrated ${totalTweets} tweets so far...`);
    }
    console.log('Tweets migration complete');

    // 3. Migrate personality analysis
    console.log('Migrating personality analysis...');
    const analyses = await sqliteDb.all('SELECT * FROM personality_analysis');
    console.log(`Found ${analyses.length} personality analyses to migrate`);
    
    for (const analysis of analyses) {
      await pgClient.query(
        `INSERT INTO personality_analysis 
         (id, user_id, traits, interests, communication_style, analyzed_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [analysis.id, analysis.user_id, analysis.traits, analysis.interests, 
         analysis.communication_style, analysis.analyzed_at]
      );
    }
    console.log('Personality analysis migration complete');

    // 4. Migrate funnel progress
    console.log('Migrating funnel progress...');
    const funnelProgress = await sqliteDb.all('SELECT * FROM funnel_progress');
    console.log(`Found ${funnelProgress.length} funnel progress records to migrate`);
    
    for (const progress of funnelProgress) {
      await pgClient.query(
        `INSERT INTO funnel_progress 
         (user_id, current_command_index, completed_commands, command_responses, last_updated)
         VALUES ($1, $2, $3, $4, $5)`,
        [progress.user_id, progress.current_command_index, progress.completed_commands,
         progress.command_responses, progress.last_updated]
      );
    }
    console.log('Funnel progress migration complete');

    // 5. Migrate funnel completion
    console.log('Migrating funnel completion...');
    const funnelCompletion = await sqliteDb.all('SELECT * FROM funnel_completion');
    console.log(`Found ${funnelCompletion.length} funnel completion records to migrate`);
    
    for (const completion of funnelCompletion) {
      await pgClient.query(
        `INSERT INTO funnel_completion 
         (user_id, completed_at, completion_data)
         VALUES ($1, $2, $3)`,
        [completion.user_id, completion.completed_at, completion.completion_data]
      );
    }
    console.log('Funnel completion migration complete');

    // 6. Migrate referral tracking
    console.log('Migrating referral tracking...');
    const referralTracking = await sqliteDb.all('SELECT * FROM referral_tracking');
    console.log(`Found ${referralTracking.length} referral tracking records to migrate`);
    
    for (const tracking of referralTracking) {
      await pgClient.query(
        `INSERT INTO referral_tracking 
         (id, referral_code, referrer_user_id, referred_user_id, used_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [tracking.id, tracking.referral_code, tracking.referrer_user_id,
         tracking.referred_user_id, tracking.used_at]
      );
    }
    console.log('Referral tracking migration complete');

    // 7. Migrate referral codes
    console.log('Migrating referral codes...');
    const referralCodes = await sqliteDb.all('SELECT * FROM referral_codes');
    console.log(`Found ${referralCodes.length} referral codes to migrate`);
    
    for (const code of referralCodes) {
      await pgClient.query(
        `INSERT INTO referral_codes 
         (code, owner_user_id, usage_count, created_at)
         VALUES ($1, $2, $3, $4)`,
        [code.code, code.owner_user_id, code.usage_count, code.created_at]
      );
    }
    console.log('Referral codes migration complete');

    // 8. Migrate referral usage log
    console.log('Migrating referral usage log...');
    const referralUsage = await sqliteDb.all('SELECT * FROM referral_usage_log');
    console.log(`Found ${referralUsage.length} referral usage records to migrate`);
    
    for (const usage of referralUsage) {
      await pgClient.query(
        `INSERT INTO referral_usage_log 
         (id, referral_code, used_by_user_id, used_at)
         VALUES ($1, $2, $3, $4)`,
        [usage.id, usage.referral_code, usage.used_by_user_id, usage.used_at]
      );
    }
    console.log('Referral usage log migration complete');

    // Commit transaction
    console.log('Committing transaction...');
    await pgClient.query('COMMIT');
    console.log('Migration completed successfully!');

    // Log final statistics
    console.log('\nMigration Statistics:');
    console.log(`- Users: ${users.length}`);
    console.log(`- Tweets: ${totalTweets}`);
    console.log(`- Personality Analyses: ${analyses.length}`);
    console.log(`- Funnel Progress Records: ${funnelProgress.length}`);
    console.log(`- Funnel Completion Records: ${funnelCompletion.length}`);
    console.log(`- Referral Tracking Records: ${referralTracking.length}`);
    console.log(`- Referral Codes: ${referralCodes.length}`);
    console.log(`- Referral Usage Records: ${referralUsage.length}`);

  } catch (error) {
    console.error('Migration failed:', error);
    console.log('Rolling back transaction...');
    await pgPool.query('ROLLBACK');
    throw error;
  } finally {
    console.log('Closing database connections...');
    await pgPool.end();
    await sqliteDb.close();
  }
}

// Execute migration
migrateTables().catch(error => {
  console.error('Migration script failed:', error);
  process.exit(1);
}); 