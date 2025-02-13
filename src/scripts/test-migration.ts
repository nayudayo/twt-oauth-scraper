import { Database, open } from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load migration environment variables
dotenv.config({ path: '.env.migration' });

// Test data
const TEST_DATA = {
  users: [
    {
      id: 'user_test_1',
      username: 'testuser1',
      profile_data: JSON.stringify({ bio: 'Test user 1' }),
      profile_picture_url: 'https://example.com/pic1.jpg',
    },
    {
      id: 'user_test_2',
      username: 'testuser2',
      profile_data: JSON.stringify({ bio: 'Test user 2' }),
      profile_picture_url: 'https://example.com/pic2.jpg',
    }
  ],
  tweets: [
    {
      id: 'tweet_test_1',
      user_id: 'user_test_1',
      text: 'Test tweet 1',
      created_at: new Date().toISOString(),
      url: 'https://twitter.com/1',
      is_reply: false,
      metadata: JSON.stringify({ likes: 10 })
    },
    {
      id: 'tweet_test_2',
      user_id: 'user_test_2',
      text: 'Test tweet 2',
      created_at: new Date().toISOString(),
      url: 'https://twitter.com/2',
      is_reply: true,
      metadata: JSON.stringify({ likes: 20 })
    }
  ],
  personality_analysis: [
    {
      id: 'analysis_test_1',
      user_id: 'user_test_1',
      traits: JSON.stringify([{ name: 'openness', score: 0.8 }]),
      interests: JSON.stringify(['technology']),
      communication_style: JSON.stringify({ formality: 0.7 })
    }
  ],
  funnel_progress: [
    {
      user_id: 'user_test_1',
      current_command_index: 2,
      completed_commands: JSON.stringify(['JOIN_TELEGRAM', 'SOL_WALLET']),
      command_responses: JSON.stringify({ 'JOIN_TELEGRAM': 'done' })
    }
  ],
  referral_codes: [
    {
      code: 'TEST-CODE-123',
      owner_user_id: 'user_test_1',
      usage_count: 1
    }
  ]
};

async function setupTestData() {
  console.log('Setting up test data in SQLite...');
  
  // Create test SQLite database
  const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test_twitter.db');
  
  // Remove existing test database if it exists
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const sqliteDb: Database = await open({
    filename: TEST_DB_PATH,
    driver: sqlite3.Database
  });

  try {
    // Create schema
    await sqliteDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        profile_data JSON,
        profile_picture_url TEXT,
        last_scraped DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE tweets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        url TEXT,
        is_reply BOOLEAN,
        metadata JSON,
        created_in_db DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE personality_analysis (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        traits JSON NOT NULL,
        interests JSON NOT NULL,
        communication_style JSON NOT NULL,
        analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE funnel_progress (
        user_id TEXT PRIMARY KEY,
        current_command_index INTEGER DEFAULT 0,
        completed_commands JSON DEFAULT '[]',
        command_responses JSON DEFAULT '{}',
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE funnel_completion (
        user_id TEXT PRIMARY KEY,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completion_data JSON DEFAULT '{}',
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE referral_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referral_code TEXT NOT NULL,
        referrer_user_id TEXT NOT NULL,
        referred_user_id TEXT NOT NULL,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_user_id) REFERENCES users(id),
        FOREIGN KEY (referred_user_id) REFERENCES users(id),
        UNIQUE(referred_user_id)
      );

      CREATE TABLE referral_codes (
        code TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_user_id) REFERENCES users(id)
      );

      CREATE TABLE referral_usage_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referral_code TEXT NOT NULL,
        used_by_user_id TEXT NOT NULL,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referral_code) REFERENCES referral_codes(code),
        FOREIGN KEY (used_by_user_id) REFERENCES users(id)
      );
    `);

    // Insert test data
    for (const user of TEST_DATA.users) {
      await sqliteDb.run(
        'INSERT INTO users (id, username, profile_data, profile_picture_url) VALUES (?, ?, ?, ?)',
        [user.id, user.username, user.profile_data, user.profile_picture_url]
      );
    }

    for (const tweet of TEST_DATA.tweets) {
      await sqliteDb.run(
        'INSERT INTO tweets (id, user_id, text, created_at, url, is_reply, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [tweet.id, tweet.user_id, tweet.text, tweet.created_at, tweet.url, tweet.is_reply, tweet.metadata]
      );
    }

    for (const analysis of TEST_DATA.personality_analysis) {
      await sqliteDb.run(
        'INSERT INTO personality_analysis (id, user_id, traits, interests, communication_style) VALUES (?, ?, ?, ?, ?)',
        [analysis.id, analysis.user_id, analysis.traits, analysis.interests, analysis.communication_style]
      );
    }

    for (const progress of TEST_DATA.funnel_progress) {
      await sqliteDb.run(
        'INSERT INTO funnel_progress (user_id, current_command_index, completed_commands, command_responses) VALUES (?, ?, ?, ?)',
        [progress.user_id, progress.current_command_index, progress.completed_commands, progress.command_responses]
      );
    }

    for (const code of TEST_DATA.referral_codes) {
      await sqliteDb.run(
        'INSERT INTO referral_codes (code, owner_user_id, usage_count) VALUES (?, ?, ?)',
        [code.code, code.owner_user_id, code.usage_count]
      );
    }

    console.log('Test data setup complete');
  } catch (error) {
    console.error('Error setting up test data:', error);
    throw error;
  } finally {
    await sqliteDb?.close();
  }

  // Update environment variable to use test database
  process.env.SQLITE_PATH = TEST_DB_PATH;
}

async function verifyMigration() {
  console.log('Verifying migration results...');

  const pgPool = new Pool({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    port: parseInt(process.env.PG_PORT || '5432')
  });

  try {
    // Verify record counts
    const counts = await Promise.all([
      pgPool.query('SELECT COUNT(*) FROM users'),
      pgPool.query('SELECT COUNT(*) FROM tweets'),
      pgPool.query('SELECT COUNT(*) FROM personality_analysis'),
      pgPool.query('SELECT COUNT(*) FROM funnel_progress'),
      pgPool.query('SELECT COUNT(*) FROM referral_codes')
    ]);

    console.log('\nRecord counts:');
    console.log('Users:', counts[0].rows[0].count);
    console.log('Tweets:', counts[1].rows[0].count);
    console.log('Personality Analyses:', counts[2].rows[0].count);
    console.log('Funnel Progress:', counts[3].rows[0].count);
    console.log('Referral Codes:', counts[4].rows[0].count);

    // Verify data integrity
    const user1Result = await pgPool.query('SELECT * FROM users WHERE id = $1', ['user_test_1']);
    const tweet1Result = await pgPool.query('SELECT * FROM tweets WHERE id = $1', ['tweet_test_1']);
    const analysis1Result = await pgPool.query('SELECT * FROM personality_analysis WHERE id = $1', ['analysis_test_1']);

    console.log('\nData integrity checks:');
    
    // Check if user exists and has correct data
    if (user1Result.rows.length > 0) {
      console.log('User 1 username:', user1Result.rows[0].username === 'testuser1' ? '✅' : '❌');
      
      // Only check JSONB fields if user exists
      const profileData = user1Result.rows[0].profile_data;
      console.log('\nJSONB field checks:');
      console.log('Profile data is object:', typeof profileData === 'object' ? '✅' : '❌');
    } else {
      console.log('❌ User 1 not found in database');
    }

    // Check if tweet exists and has correct data
    if (tweet1Result.rows.length > 0) {
      console.log('Tweet 1 text:', tweet1Result.rows[0].text === 'Test tweet 1' ? '✅' : '❌');
    } else {
      console.log('❌ Tweet 1 not found in database');
    }

    // Check if analysis exists
    if (analysis1Result.rows.length > 0) {
      console.log('Analysis 1 exists:', '✅');
      const traits = analysis1Result.rows[0].traits;
      console.log('Traits is array:', Array.isArray(traits) ? '✅' : '❌');
    } else {
      console.log('❌ Analysis 1 not found in database');
    }

    console.log('\nMigration verification complete');
  } catch (error) {
    console.error('Error verifying migration:', error);
    throw error;
  } finally {
    await pgPool.end();
  }
}

async function runTest() {
  try {
    // 1. Set up test data
    await setupTestData();

    // 2. Run migration script
    console.log('\nRunning migration script...');
    await import('./migrate-to-postgres');

    // 3. Wait a bit to ensure migration completes
    console.log('Waiting for migration to complete...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Verify results
    await verifyMigration();

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest(); 