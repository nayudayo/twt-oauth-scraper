"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseError = void 0;
exports.initDB = initDB;
exports.getDB = getDB;
exports.closeDB = closeDB;
const factory_1 = require("./factory");
const errors_1 = require("./adapters/errors");
const pg_1 = require("pg");
const conversation_1 = require("./conversation");
const access_1 = require("./access");
const cache_1 = require("./cache");
// Re-export types
var errors_2 = require("./adapters/errors");
Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: function () { return errors_2.DatabaseError; } });
let dbInstance = null;
let conversationDB = null;
let accessDB = null;
let personalityCache = null;
async function initDB(config) {
    try {
        // Return existing instance if available
        if (dbInstance && conversationDB && accessDB && personalityCache) {
            return Object.assign(dbInstance, {
                conversation: conversationDB,
                access: accessDB,
                personality: personalityCache
            });
        }
        // Initialize database instance
        dbInstance = await factory_1.DatabaseFactory.initialize(config || {
            type: 'postgres',
            host: process.env.PG_HOST || 'localhost',
            port: parseInt(process.env.PG_PORT || '5432'),
            database: process.env.PG_DATABASE || 'postgres',
            user: process.env.PG_USER || 'postgres',
            password: process.env.PG_PASSWORD || ''
        });
        // Create a new pool for our operations
        const pool = new pg_1.Pool({
            user: process.env.PG_USER,
            password: process.env.PG_PASSWORD,
            host: process.env.PG_HOST,
            database: process.env.PG_DATABASE,
            port: parseInt(process.env.PG_PORT || '5432')
        });
        // Initialize sub-systems
        conversationDB = new conversation_1.ConversationDB(pool);
        accessDB = new access_1.AccessCodeDB(pool);
        personalityCache = new cache_1.PersonalityCacheDB(pool);
        // Extend the adapter with our operations
        return Object.assign(dbInstance, {
            conversation: conversationDB,
            access: accessDB,
            personality: personalityCache
        });
    }
    catch (error) {
        console.error('Failed to initialize database:', error);
        throw new errors_1.DatabaseError('Failed to initialize database');
    }
}
async function getDB() {
    if (!dbInstance) {
        throw new errors_1.DatabaseError('Database not initialized. Call initDB() first.');
    }
    return dbInstance;
}
async function closeDB() {
    if (dbInstance) {
        await factory_1.DatabaseFactory.shutdown();
        dbInstance = null;
        conversationDB = null;
        accessDB = null;
        personalityCache = null;
    }
}
