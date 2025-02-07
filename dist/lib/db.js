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
exports.getCommandProgress = getCommandProgress;
exports.updateCommandProgress = updateCommandProgress;
exports.resetCommandProgress = resetCommandProgress;
exports.getFunnelProgress = getFunnelProgress;
exports.updateFunnelProgress = updateFunnelProgress;
exports.checkFunnelCompletion = checkFunnelCompletion;
exports.markFunnelCompleted = markFunnelCompleted;
exports.trackReferralUse = trackReferralUse;
exports.getReferralStats = getReferralStats;
exports.validateReferralCode = validateReferralCode;
exports.getReferralCodeUsage = getReferralCodeUsage;
exports.createReferralCode = createReferralCode;
exports.saveProgress = saveProgress;
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
// Helper function to generate unique IDs
function generateId() {
    return `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
// Write Queue Implementation
class WriteQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }
    async add(operation) {
        return new Promise((resolve, reject) => {
            this.queue.push({ operation, resolve, reject });
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0)
            return;
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            try {
                await item.operation();
                item.resolve();
            }
            catch (error) {
                console.error('Error in write queue operation:', error);
                item.reject(error);
            }
        }
        this.isProcessing = false;
    }
}
// Create a singleton instance of the write queue
const writeQueue = new WriteQueue();
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

      CREATE TABLE IF NOT EXISTS referral_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referral_code TEXT NOT NULL,
        referrer_user_id TEXT NOT NULL,
        referred_user_id TEXT NOT NULL,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_user_id) REFERENCES users(id),
        FOREIGN KEY (referred_user_id) REFERENCES users(id),
        UNIQUE(referred_user_id)  -- Each user can only use one referral code
      );

      CREATE TABLE IF NOT EXISTS referral_codes (
        code TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS referral_usage_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referral_code TEXT NOT NULL,
        used_by_user_id TEXT NOT NULL,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referral_code) REFERENCES referral_codes(code),
        FOREIGN KEY (used_by_user_id) REFERENCES users(id)
      );
    
      -- Indexes for better query performance
      CREATE INDEX IF NOT EXISTS idx_tweets_user ON tweets(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at);
      CREATE INDEX IF NOT EXISTS idx_tweets_text ON tweets(text);
      CREATE INDEX IF NOT EXISTS idx_referral_code ON referral_tracking(referral_code);
      CREATE INDEX IF NOT EXISTS idx_referrer ON referral_tracking(referrer_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_code_owner ON referral_codes(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_usage ON referral_usage_log(referral_code);
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
    await writeQueue.add(async () => {
        try {
            await db.run('BEGIN TRANSACTION');
            const existingUser = await db.get('SELECT id FROM users WHERE username = ?', username);
            if (existingUser) {
                await db.run(`UPDATE users 
           SET profile_data = ?, profile_picture_url = ?, last_scraped = CURRENT_TIMESTAMP 
           WHERE username = ?`, [JSON.stringify(profile), profile.imageUrl, username]);
            }
            else {
                await db.run(`INSERT INTO users (id, username, profile_data, profile_picture_url, last_scraped) 
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [generateId(), username, JSON.stringify(profile), profile.imageUrl]);
            }
            await db.run('COMMIT');
        }
        catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    });
}
// Helper function to save tweets in bulk
async function saveTweets(db, username, tweets) {
    await writeQueue.add(async () => {
        try {
            await db.run('BEGIN TRANSACTION');
            const user = await db.get('SELECT id FROM users WHERE username = ?', username);
            if (!user)
                throw new Error('User not found');
            // Process tweets in smaller batches to avoid large transactions
            const BATCH_SIZE = 50;
            for (let i = 0; i < tweets.length; i += BATCH_SIZE) {
                const batch = tweets.slice(i, i + BATCH_SIZE);
                for (const tweet of batch) {
                    await db.run(`INSERT OR REPLACE INTO tweets 
             (id, user_id, text, created_at, url, is_reply, metadata) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                        tweet.id,
                        user.id,
                        tweet.text,
                        tweet.timestamp,
                        tweet.url,
                        tweet.isReply,
                        JSON.stringify({
                            metrics: tweet.metrics,
                            images: tweet.images
                        })
                    ]);
                }
            }
            await db.run('COMMIT');
        }
        catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    });
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
// Helper function to get user's command progress
async function getCommandProgress(db, userId) {
    try {
        const progress = await db.get(`
      SELECT * FROM command_progress
      WHERE user_id = ?
    `, userId);
        if (!progress)
            return null;
        return {
            user_id: progress.user_id,
            current_command_index: progress.current_command_index,
            completed_commands: JSON.parse(progress.completed_commands),
            last_updated: progress.last_updated
        };
    }
    catch (error) {
        console.error('Failed to get command progress:', error);
        throw error;
    }
}
// Helper function to update user's command progress
async function updateCommandProgress(db, userId, currentIndex, completedCommands) {
    try {
        await db.run(`
      INSERT OR REPLACE INTO command_progress (
        user_id,
        current_command_index,
        completed_commands,
        last_updated
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, userId, currentIndex, JSON.stringify(completedCommands));
    }
    catch (error) {
        console.error('Failed to update command progress:', error);
        throw error;
    }
}
// Helper function to reset user's command progress
async function resetCommandProgress(db, userId) {
    try {
        await db.run(`
      DELETE FROM command_progress
      WHERE user_id = ?
    `, userId);
    }
    catch (error) {
        console.error('Failed to reset command progress:', error);
        throw error;
    }
}
// Helper function to get user's funnel progress
async function getFunnelProgress(db, userId) {
    try {
        const progress = await db.get(`
      SELECT * FROM funnel_progress
      WHERE user_id = ?
    `, userId);
        if (!progress)
            return null;
        return {
            user_id: progress.user_id,
            current_command_index: progress.current_command_index,
            completed_commands: JSON.parse(progress.completed_commands),
            command_responses: JSON.parse(progress.command_responses),
            last_updated: progress.last_updated
        };
    }
    catch (error) {
        console.error('Failed to get funnel progress:', error);
        throw error;
    }
}
// Helper function to update user's funnel progress
async function updateFunnelProgress(db, userId, currentIndex, completedCommands, commandResponses) {
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
    `, userId, currentIndex, JSON.stringify(completedCommands), JSON.stringify(commandResponses));
    }
    catch (error) {
        console.error('Failed to update funnel progress:', error);
        throw error;
    }
}
// Helper function to check if user has completed the funnel
async function checkFunnelCompletion(db, userId) {
    try {
        const completion = await db.get(`
      SELECT * FROM funnel_completion
      WHERE user_id = ?
    `, userId);
        if (!completion)
            return null;
        return {
            user_id: completion.user_id,
            completed_at: completion.completed_at,
            completion_data: JSON.parse(completion.completion_data)
        };
    }
    catch (error) {
        console.error('Failed to check funnel completion:', error);
        throw error;
    }
}
// Helper function to mark funnel as completed
async function markFunnelCompleted(db, userId, completionData) {
    try {
        await db.run(`
      INSERT OR REPLACE INTO funnel_completion (
        user_id,
        completed_at,
        completion_data
      )
      VALUES (?, CURRENT_TIMESTAMP, ?)
    `, userId, JSON.stringify(completionData));
    }
    catch (error) {
        console.error('Failed to mark funnel as completed:', error);
        throw error;
    }
}
// Helper function to track referral usage
async function trackReferralUse(db, referralCode, usedByUserId) {
    try {
        // Start a transaction to ensure both operations complete
        await db.run('BEGIN TRANSACTION');
        // Increment the usage count
        await db.run(`
      UPDATE referral_codes 
      SET usage_count = usage_count + 1 
      WHERE code = ?
    `, referralCode);
        // Log the usage
        await db.run(`
      INSERT INTO referral_usage_log (referral_code, used_by_user_id)
      VALUES (?, ?)
    `, referralCode, usedByUserId);
        await db.run('COMMIT');
        return true;
    }
    catch (error) {
        await db.run('ROLLBACK');
        console.error('Failed to track referral usage:', error);
        return false;
    }
}
// Helper function to get referral statistics for a user
async function getReferralStats(db, userId) {
    try {
        // Get all referral codes owned by the user with their usage counts
        const codes = await db.all(`
      SELECT code, owner_user_id, usage_count, created_at
      FROM referral_codes 
      WHERE owner_user_id = ?
    `, userId);
        // Get recent usage logs
        const recentUsage = await db.all(`
      SELECT rl.referral_code, rl.used_by_user_id, rl.used_at
      FROM referral_usage_log rl
      JOIN referral_codes rc ON rl.referral_code = rc.code
      WHERE rc.owner_user_id = ?
      ORDER BY rl.used_at DESC
      LIMIT 10
    `, userId);
        return {
            codes,
            recentUsage,
            totalUses: codes.reduce((sum, code) => sum + code.usage_count, 0)
        };
    }
    catch (error) {
        console.error('Failed to get referral stats:', error);
        return { codes: [], recentUsage: [], totalUses: 0 };
    }
}
// Helper function to check if a referral code exists and is valid
async function validateReferralCode(db, referralCode) {
    try {
        await db.run('BEGIN TRANSACTION');
        // Special case for "NO"
        if (referralCode.toUpperCase() === 'NO') {
            console.log('Validating "NO" referral code');
            await db.run('COMMIT');
            return true;
        }
        // Normalize the code before checking
        const normalizedCode = referralCode.trim().toUpperCase();
        console.log('Validating referral code:', normalizedCode);
        // First check if the code exists
        const result = await db.get(`
      SELECT rc.code, rc.owner_user_id, rc.usage_count, u.username as owner_username
      FROM referral_codes rc
      LEFT JOIN users u ON rc.owner_user_id = u.id
      WHERE UPPER(rc.code) = UPPER(?)
    `, normalizedCode);
        console.log('Validation result:', {
            code: result === null || result === void 0 ? void 0 : result.code,
            ownerUsername: result === null || result === void 0 ? void 0 : result.owner_username,
            usageCount: result === null || result === void 0 ? void 0 : result.usage_count
        });
        await db.run('COMMIT');
        return result !== undefined;
    }
    catch (error) {
        console.error('Failed to validate referral code:', error);
        await db.run('ROLLBACK');
        return false;
    }
}
// Helper function to get a specific referral code's usage count
async function getReferralCodeUsage(db, referralCode) {
    try {
        const result = await db.get(`
      SELECT usage_count
      FROM referral_codes
      WHERE code = ?
    `, referralCode);
        return (result === null || result === void 0 ? void 0 : result.usage_count) || 0;
    }
    catch (error) {
        console.error('Failed to get referral code usage:', error);
        return 0;
    }
}
// Helper function to create a new referral code
async function createReferralCode(db, code, ownerUserId) {
    try {
        await db.run('BEGIN TRANSACTION');
        // Normalize the code
        const normalizedCode = code.trim().toUpperCase();
        console.log('Attempting to create referral code:', {
            code: normalizedCode,
            ownerUserId
        });
        // First check if code already exists
        const existing = await db.get('SELECT code, owner_user_id FROM referral_codes WHERE UPPER(code) = UPPER(?)', normalizedCode);
        if (existing) {
            console.log('Referral code already exists:', {
                code: normalizedCode,
                existingOwnerId: existing.owner_user_id
            });
            await db.run('ROLLBACK');
            return false;
        }
        // Get owner username for logging
        const owner = await db.get('SELECT username FROM users WHERE id = ?', ownerUserId);
        console.log('Creating new referral code:', {
            code: normalizedCode,
            ownerUserId,
            ownerUsername: owner === null || owner === void 0 ? void 0 : owner.username
        });
        // Create the new code
        await db.run(`
      INSERT INTO referral_codes (code, owner_user_id)
      VALUES (?, ?)
    `, normalizedCode, ownerUserId);
        await db.run('COMMIT');
        return true;
    }
    catch (error) {
        console.error('Failed to create referral code:', error);
        await db.run('ROLLBACK');
        return false;
    }
}
// Helper function to save progress
async function saveProgress(userId, currentIndex, completedCommands) {
    try {
        const db = await (0, sqlite_1.open)({
            filename: DB_PATH,
            driver: sqlite3_1.default.Database
        });
        await db.run(`INSERT OR REPLACE INTO funnel_progress (
        user_id, 
        current_command_index, 
        completed_commands,
        command_responses,
        last_updated
      ) VALUES (?, ?, ?, '{}', CURRENT_TIMESTAMP)`, [userId, currentIndex, JSON.stringify(completedCommands)]);
        await db.close();
        return true;
    }
    catch (error) {
        console.error('Error saving progress:', error);
        return false;
    }
}
