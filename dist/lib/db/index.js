"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseError = void 0;
exports.initDB = initDB;
exports.getDB = getDB;
exports.closeDB = closeDB;
const factory_1 = require("./factory");
const errors_1 = require("./adapters/errors");
var errors_2 = require("./adapters/errors");
Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: function () { return errors_2.DatabaseError; } });
// Default database configuration
const DEFAULT_CONFIG = {
    type: 'postgres',
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'twitter_analysis_db',
    user: process.env.PG_USER || 'postgres',
    maxConnections: parseInt(process.env.PG_MAX_CONNECTIONS || '20'),
    minConnections: parseInt(process.env.PG_MIN_CONNECTIONS || '2'),
    connectionTimeoutMs: parseInt(process.env.PG_CONNECTION_TIMEOUT || '10000'),
    idleTimeoutMs: parseInt(process.env.PG_IDLE_TIMEOUT || '30000')
};
let dbInstance = null;
async function initDB() {
    if (dbInstance) {
        return dbInstance;
    }
    try {
        // Validate required environment variables
        if (!process.env.PG_PASSWORD) {
            throw new errors_1.DatabaseError('Database password not provided in environment variables');
        }
        // Initialize database with configuration
        const db = await factory_1.DatabaseFactory.initialize(Object.assign(Object.assign({}, DEFAULT_CONFIG), { password: process.env.PG_PASSWORD, 
            // Allow overriding connection string from environment
            connectionString: process.env.DATABASE_URL }));
        dbInstance = db;
        return db;
    }
    catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
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
