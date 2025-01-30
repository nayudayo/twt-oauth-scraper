import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import { Tweet, TwitterProfile } from '@/types/scraper'
import path from 'path'
import fs from 'fs'

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), 'data')
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const DB_PATH = path.join(DATA_DIR, 'twitter.db')

// Define database interface
interface DBTweet {
  id: string
  user_id: string
  text: string
  created_at: string
  url: string | null
  is_reply: boolean
  metadata: string // JSON string
}

interface DBAnalysis {
  id: string
  user_id: string
  traits: string // JSON string
  interests: string // JSON string
  communication_style: string // JSON string
  analyzed_at: string
}

interface CommandProgress {
  user_id: string
  current_command_index: number
  completed_commands: string[] // Array of completed command names
  last_updated: string
}

interface FunnelProgress {
  user_id: string
  current_command_index: number
  completed_commands: string[]
  command_responses: { [key: string]: string } // Store user responses for each command
  last_updated: string
}

interface FunnelCompletion {
  user_id: string
  completed_at: string
  completion_data: {
    telegram_username?: string
    wallet_address?: string
    referral_code?: string
  }
}

export async function initDB() {
  try {
    console.log('Initializing database at:', DB_PATH)
    
    // Ensure directory has correct permissions
    fs.chmodSync(DATA_DIR, 0o777)
    
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    })
    
    // Set database file permissions
    fs.chmodSync(DB_PATH, 0o666)
    
    console.log('Database initialized successfully')
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        profile_data JSON,
        profile_picture_url TEXT,
        last_scraped DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    
      CREATE TABLE IF NOT EXISTS tweets (
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
    
      CREATE TABLE IF NOT EXISTS personality_analysis (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        traits JSON NOT NULL,
        interests JSON NOT NULL,
        communication_style JSON NOT NULL,
        analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS funnel_progress (
        user_id TEXT PRIMARY KEY,
        current_command_index INTEGER DEFAULT 0,
        completed_commands JSON DEFAULT '[]',
        command_responses JSON DEFAULT '{}',
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS funnel_completion (
        user_id TEXT PRIMARY KEY,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completion_data JSON DEFAULT '{}',
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    
      -- Indexes for better query performance
      CREATE INDEX IF NOT EXISTS idx_tweets_user ON tweets(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at);
      CREATE INDEX IF NOT EXISTS idx_tweets_text ON tweets(text);
    `)
    
    return db
  } catch (error) {
    console.error('Error initializing database:', error)
    throw error
  }
}

// Helper function to save user profile
export async function saveUserProfile(db: Database, username: string, profile: TwitterProfile) {
  try {
    console.log(`Saving profile for user: ${username}`)
    const result = await db.run(`
      INSERT OR REPLACE INTO users (id, username, profile_data, profile_picture_url, last_scraped)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, username, username, JSON.stringify(profile), profile.imageUrl)
    console.log('Profile saved successfully:', result)
    return result
  } catch (error) {
    console.error('Failed to save user profile:', error)
    throw error
  }
}

// Helper function to save tweets in bulk
export async function saveTweets(db: Database, userId: string, tweets: Tweet[]) {
  try {
    console.log(`Saving ${tweets.length} tweets for user: ${userId}`)
    const stmt = await db.prepare(`
      INSERT OR REPLACE INTO tweets (id, user_id, text, created_at, url, is_reply, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    for (const tweet of tweets) {
      await stmt.run(
        tweet.id,
        userId,
        tweet.text,
        new Date(tweet.createdAt).toISOString(),
        tweet.url || null,
        tweet.isReply || false,
        JSON.stringify(tweet)
      )
    }
    
    await stmt.finalize()
    console.log('Tweets saved successfully')
  } catch (error) {
    console.error('Failed to save tweets:', error)
    throw error
  }
}

// Helper function to get user's tweets for analysis
export async function getUserTweets(db: Database, username: string): Promise<Tweet[]> {
  try {
    console.log(`Fetching tweets for user: ${username}`)
    const tweets = await db.all<DBTweet[]>(`
      SELECT * FROM tweets 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `, username)
    
    console.log(`Found ${tweets.length} tweets`)
    return tweets.map(tweet => ({
      id: tweet.id,
      text: tweet.text,
      createdAt: tweet.created_at,
      url: tweet.url || undefined,
      isReply: tweet.is_reply,
      ...JSON.parse(tweet.metadata)
    }))
  } catch (error) {
    console.error('Failed to get user tweets:', error)
    throw error
  }
}

// Helper function to save personality analysis
export async function savePersonalityAnalysis(
  db: Database, 
  userId: string, 
  analysis: {
    traits: {
      name: string
      score: number
      explanation?: string
    }[]
    interests: string[]
    communicationStyle: {
      formality: number
      enthusiasm: number
      technicalLevel: number
      emojiUsage: number
    }
  }
) {
  return db.run(`
    INSERT INTO personality_analysis (
      id,
      user_id,
      traits,
      interests,
      communication_style
    )
    VALUES (?, ?, ?, ?, ?)
  `, 
    `${userId}_${Date.now()}`,
    userId,
    JSON.stringify(analysis.traits),
    JSON.stringify(analysis.interests),
    JSON.stringify(analysis.communicationStyle)
  )
}

// Helper function to get latest personality analysis
export async function getLatestAnalysis(db: Database, userId: string) {
  const analysis = await db.get<DBAnalysis>(`
    SELECT * FROM personality_analysis
    WHERE user_id = ?
    ORDER BY analyzed_at DESC
    LIMIT 1
  `, userId)

  if (!analysis) return null

  return {
    traits: JSON.parse(analysis.traits),
    interests: JSON.parse(analysis.interests),
    communicationStyle: JSON.parse(analysis.communication_style),
    analyzedAt: analysis.analyzed_at
  }
}

// Helper function to get user's command progress
export async function getCommandProgress(db: Database, userId: string): Promise<CommandProgress | null> {
  try {
    const progress = await db.get(`
      SELECT * FROM command_progress
      WHERE user_id = ?
    `, userId)

    if (!progress) return null

    return {
      user_id: progress.user_id,
      current_command_index: progress.current_command_index,
      completed_commands: JSON.parse(progress.completed_commands),
      last_updated: progress.last_updated
    }
  } catch (error) {
    console.error('Failed to get command progress:', error)
    throw error
  }
}

// Helper function to update user's command progress
export async function updateCommandProgress(
  db: Database, 
  userId: string, 
  currentIndex: number,
  completedCommands: string[]
): Promise<void> {
  try {
    await db.run(`
      INSERT OR REPLACE INTO command_progress (
        user_id,
        current_command_index,
        completed_commands,
        last_updated
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, userId, currentIndex, JSON.stringify(completedCommands))
  } catch (error) {
    console.error('Failed to update command progress:', error)
    throw error
  }
}

// Helper function to reset user's command progress
export async function resetCommandProgress(db: Database, userId: string): Promise<void> {
  try {
    await db.run(`
      DELETE FROM command_progress
      WHERE user_id = ?
    `, userId)
  } catch (error) {
    console.error('Failed to reset command progress:', error)
    throw error
  }
}

// Helper function to get user's funnel progress
export async function getFunnelProgress(db: Database, userId: string): Promise<FunnelProgress | null> {
  try {
    const progress = await db.get(`
      SELECT * FROM funnel_progress
      WHERE user_id = ?
    `, userId)

    if (!progress) return null

    return {
      user_id: progress.user_id,
      current_command_index: progress.current_command_index,
      completed_commands: JSON.parse(progress.completed_commands),
      command_responses: JSON.parse(progress.command_responses),
      last_updated: progress.last_updated
    }
  } catch (error) {
    console.error('Failed to get funnel progress:', error)
    throw error
  }
}

// Helper function to update user's funnel progress
export async function updateFunnelProgress(
  db: Database, 
  userId: string, 
  currentIndex: number,
  completedCommands: string[],
  commandResponses: { [key: string]: string }
): Promise<void> {
  try {
    await db.run(`
      INSERT OR REPLACE INTO funnel_progress (
        user_id,
        current_command_index,
        completed_commands,
        command_responses,
        last_updated
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, userId, currentIndex, JSON.stringify(completedCommands), JSON.stringify(commandResponses))
  } catch (error) {
    console.error('Failed to update funnel progress:', error)
    throw error
  }
}

// Helper function to check if user has completed the funnel
export async function checkFunnelCompletion(db: Database, userId: string): Promise<FunnelCompletion | null> {
  try {
    const completion = await db.get(`
      SELECT * FROM funnel_completion
      WHERE user_id = ?
    `, userId)

    if (!completion) return null

    return {
      user_id: completion.user_id,
      completed_at: completion.completed_at,
      completion_data: JSON.parse(completion.completion_data)
    }
  } catch (error) {
    console.error('Failed to check funnel completion:', error)
    throw error
  }
}

// Helper function to mark funnel as completed
export async function markFunnelCompleted(
  db: Database, 
  userId: string,
  completionData: FunnelCompletion['completion_data']
): Promise<void> {
  try {
    await db.run(`
      INSERT OR REPLACE INTO funnel_completion (
        user_id,
        completed_at,
        completion_data
      )
      VALUES (?, CURRENT_TIMESTAMP, ?)
    `, userId, JSON.stringify(completionData))
  } catch (error) {
    console.error('Failed to mark funnel as completed:', error)
    throw error
  }
} 