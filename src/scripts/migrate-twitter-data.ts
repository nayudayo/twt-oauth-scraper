import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';
import readline from 'readline';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function migrateDatabase() {
  console.log('🔄 Starting Twitter API migration...');

  const confirmed = await confirm(
    '⚠️  WARNING: This will modify the database schema. Make sure you have a backup. Continue?'
  );

  if (!confirmed) {
    console.log('Migration cancelled.');
    process.exit(0);
  }

  const pool = new Pool({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    port: parseInt(process.env.PG_PORT || '5432')
  });

  try {
    const client = await pool.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      console.log('1. Updating users table schema...');
      await client.query(`
        -- Make twitter_username nullable
        ALTER TABLE users 
        ALTER COLUMN twitter_username DROP NOT NULL;

        -- Ensure profile_data is JSONB and not null
        ALTER TABLE users 
        ALTER COLUMN profile_data SET DEFAULT '{}'::jsonb,
        ALTER COLUMN profile_data SET NOT NULL;

        -- Add new fields to profile_data
        UPDATE users 
        SET profile_data = profile_data || 
          jsonb_build_object(
            'description', profile_data->>'bio',
            'name', username,
            'createdAt', created_at
          )
        WHERE profile_data IS NOT NULL;
      `);

      console.log('2. Updating tweets table schema...');
      await client.query(`
        -- Ensure metadata is JSONB and not null
        ALTER TABLE tweets 
        ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
        ALTER COLUMN metadata SET NOT NULL;

        -- Move metrics to new format
        UPDATE tweets 
        SET metadata = jsonb_build_object(
          'viewCount', (metadata->'metrics'->>'views')::numeric,
          'conversationId', metadata->>'conversation_id',
          'inReplyToId', metadata->>'in_reply_to_id',
          'inReplyToUserId', metadata->>'in_reply_to_user_id',
          'inReplyToUsername', metadata->>'in_reply_to_username',
          'lang', metadata->>'lang',
          'entities', jsonb_build_object(
            'hashtags', COALESCE(metadata->'entities'->'hashtags', '[]'::jsonb),
            'urls', COALESCE(metadata->'entities'->'urls', '[]'::jsonb),
            'user_mentions', COALESCE(metadata->'entities'->'user_mentions', '[]'::jsonb)
          )
        )
        WHERE metadata IS NOT NULL;

        -- Make url not nullable
        UPDATE tweets SET url = '' WHERE url IS NULL;
        ALTER TABLE tweets ALTER COLUMN url SET NOT NULL;
      `);

      console.log('3. Creating indexes...');
      await client.query(`
        -- Add index for tweet metadata search
        CREATE INDEX IF NOT EXISTS idx_tweets_metadata ON tweets USING gin (metadata);
        
        -- Add index for user profile search
        CREATE INDEX IF NOT EXISTS idx_users_profile_data ON users USING gin (profile_data);
        
        -- Add index for conversation lookups
        CREATE INDEX IF NOT EXISTS idx_tweets_conversation ON tweets ((metadata->>'conversationId'));
        
        -- Add index for language-based queries
        CREATE INDEX IF NOT EXISTS idx_tweets_lang ON tweets ((metadata->>'lang'));
      `);

      // Commit transaction
      await client.query('COMMIT');
      console.log('✅ Migration completed successfully!');

    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    rl.close();
  }
}

// Run migration
migrateDatabase(); 