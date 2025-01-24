import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import { Tweet, TwitterProfile } from '@/types/scraper'

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

export async function initDB() {
  const db = await open({
    filename: './data/twitter.db',
    driver: sqlite3.Database
  })

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      profile_data JSON,
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

    -- Indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_tweets_user ON tweets(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at);
    CREATE INDEX IF NOT EXISTS idx_tweets_text ON tweets(text);
  `)

  return db
}

// Helper function to save user profile
export async function saveUserProfile(db: Database, username: string, profile: TwitterProfile) {
  return db.run(`
    INSERT OR REPLACE INTO users (id, username, profile_data, last_scraped)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `, username, username, JSON.stringify(profile))
}

// Helper function to save tweets in bulk
export async function saveTweets(db: Database, userId: string, tweets: Tweet[]) {
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
}

// Helper function to get user's tweets for analysis
export async function getUserTweets(db: Database, username: string): Promise<Tweet[]> {
  const tweets = await db.all<DBTweet[]>(`
    SELECT * FROM tweets 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `, username)

  return tweets.map(tweet => ({
    id: tweet.id,
    text: tweet.text,
    createdAt: tweet.created_at,
    url: tweet.url || undefined,
    isReply: tweet.is_reply,
    ...JSON.parse(tweet.metadata)
  }))
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