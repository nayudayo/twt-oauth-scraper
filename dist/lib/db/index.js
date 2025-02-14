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
// Re-export types
var errors_2 = require("./adapters/errors");
Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: function () { return errors_2.DatabaseError; } });
let dbInstance = null;
let pool = null;
let conversationDB = null;
async function initDB() {
    try {
        if (dbInstance && pool && conversationDB) {
            return Object.assign(dbInstance, { conversation: conversationDB });
        }
        // Initialize pool if not exists
        if (!pool) {
            pool = new pg_1.Pool({
                user: process.env.PG_USER,
                password: process.env.PG_PASSWORD,
                host: process.env.PG_HOST,
                database: process.env.PG_DATABASE,
                port: parseInt(process.env.PG_PORT || '5432')
            });
        }
        // Initialize base database instance
        const config = {
            type: 'postgres',
            host: process.env.PG_HOST || 'localhost',
            port: parseInt(process.env.PG_PORT || '5432'),
            database: process.env.PG_DATABASE || 'postgres',
            user: process.env.PG_USER || 'postgres',
            password: process.env.PG_PASSWORD || ''
        };
        const db = await factory_1.DatabaseFactory.initialize(config);
        // Initialize conversation DB if not exists
        if (!conversationDB) {
            conversationDB = new conversation_1.ConversationDB(pool);
        }
        dbInstance = db;
        return Object.assign(db, { conversation: conversationDB });
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
    }
}
