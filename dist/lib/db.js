"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDB = initDB;
exports.saveUserProfile = saveUserProfile;
exports.saveTweets = saveTweets;
exports.getUserTweets = getUserTweets;
exports.savePersonalityAnalysis = savePersonalityAnalysis;
exports.getLatestAnalysis = getLatestAnalysis;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Ensure data directory exists
const DATA_DIR = path_1.default.join(process.cwd(), 'data');
if (!fs_1.default.existsSync(DATA_DIR)) {
    fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path_1.default.join(DATA_DIR, 'twitter.db');
async function initDB() {
    try {
        console.log('Initializing database at:', DB_PATH);
        // Ensure directory has correct permissions
        fs_1.default.chmodSync(DATA_DIR, 0o777);
        const db = await (0, sqlite_1.open)({
            filename: DB_PATH,
            driver: sqlite3_1.default.Database
        });
        // Set database file permissions
        fs_1.default.chmodSync(DB_PATH, 0o666);
        console.log('Database initialized successfully');
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
    `);
        return db;
    }
    catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}
// Helper function to save user profile
async function saveUserProfile(db, username, profile) {
    try {
        console.log(`Saving profile for user: ${username}`);
        const result = await db.run(`
      INSERT OR REPLACE INTO users (id, username, profile_data, last_scraped)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, username, username, JSON.stringify(profile));
        console.log('Profile saved successfully:', result);
        return result;
    }
    catch (error) {
        console.error('Failed to save user profile:', error);
        throw error;
    }
}
// Helper function to save tweets in bulk
async function saveTweets(db, userId, tweets) {
    try {
        console.log(`Saving ${tweets.length} tweets for user: ${userId}`);
        const stmt = await db.prepare(`
      INSERT OR REPLACE INTO tweets (id, user_id, text, created_at, url, is_reply, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        for (const tweet of tweets) {
            await stmt.run(tweet.id, userId, tweet.text, new Date(tweet.createdAt).toISOString(), tweet.url || null, tweet.isReply || false, JSON.stringify(tweet));
        }
        await stmt.finalize();
        console.log('Tweets saved successfully');
    }
    catch (error) {
        console.error('Failed to save tweets:', error);
        throw error;
    }
}
// Helper function to get user's tweets for analysis
async function getUserTweets(db, username) {
    try {
        console.log(`Fetching tweets for user: ${username}`);
        const tweets = await db.all(`
      SELECT * FROM tweets 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `, username);
        console.log(`Found ${tweets.length} tweets`);
        return tweets.map(tweet => (Object.assign({ id: tweet.id, text: tweet.text, createdAt: tweet.created_at, url: tweet.url || undefined, isReply: tweet.is_reply }, JSON.parse(tweet.metadata))));
    }
    catch (error) {
        console.error('Failed to get user tweets:', error);
        throw error;
    }
}
// Helper function to save personality analysis
async function savePersonalityAnalysis(db, userId, analysis) {
    return db.run(`
    INSERT INTO personality_analysis (
      id,
      user_id,
      traits,
      interests,
      communication_style
    )
    VALUES (?, ?, ?, ?, ?)
  `, `${userId}_${Date.now()}`, userId, JSON.stringify(analysis.traits), JSON.stringify(analysis.interests), JSON.stringify(analysis.communicationStyle));
}
// Helper function to get latest personality analysis
async function getLatestAnalysis(db, userId) {
    const analysis = await db.get(`
    SELECT * FROM personality_analysis
    WHERE user_id = ?
    ORDER BY analyzed_at DESC
    LIMIT 1
  `, userId);
    if (!analysis)
        return null;
    return {
        traits: JSON.parse(analysis.traits),
        interests: JSON.parse(analysis.interests),
        communicationStyle: JSON.parse(analysis.communication_style),
        analyzedAt: analysis.analyzed_at
    };
}
