"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresAdapter = void 0;
const errors_1 = require("./errors");
const connection_manager_1 = require("./postgres/connection-manager");
const user_operations_1 = require("./postgres/user-operations");
const tweet_operations_1 = require("./postgres/tweet-operations");
const analysis_operations_1 = require("./postgres/analysis-operations");
const funnel_operations_1 = require("./postgres/funnel-operations");
const referral_operations_1 = require("./postgres/referral-operations");
const monitoring_1 = require("../monitoring");
// PostgreSQL Transaction Implementation
class PostgresTransaction {
    constructor(client, monitor) {
        this.client = client;
        this.monitor = monitor;
        this.transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    async begin() {
        var _a;
        await this.client.query('BEGIN');
        (_a = this.monitor) === null || _a === void 0 ? void 0 : _a.startTransaction(this.transactionId);
    }
    async commit() {
        var _a;
        await this.client.query('COMMIT');
        (_a = this.monitor) === null || _a === void 0 ? void 0 : _a.endTransaction(this.transactionId, 'committed');
    }
    async rollback() {
        var _a;
        await this.client.query('ROLLBACK');
        (_a = this.monitor) === null || _a === void 0 ? void 0 : _a.endTransaction(this.transactionId, 'rolled_back');
    }
}
const DEFAULT_POOL_CONFIG = {
    maxConnections: 20,
    minConnections: 2,
    connectionTimeoutMs: 10000,
    idleTimeoutMs: 30000,
    retryIntervalMs: 1000,
    maxRetries: 3
};
class PostgresAdapter {
    constructor(connectionString, config) {
        this.lastConnected = null;
        this.connectionError = null;
        this.config = Object.assign(Object.assign({}, DEFAULT_POOL_CONFIG), config);
        this.connectionManager = new connection_manager_1.PostgresConnectionManager(connectionString, config);
        // Get pool from connection manager
        const pool = this.connectionManager.getPool();
        // Initialize monitoring
        this.monitor = new monitoring_1.DatabaseMonitor(pool, config === null || config === void 0 ? void 0 : config.monitoring);
        // Initialize operations with pool
        this.userOperations = new user_operations_1.PostgresUserOperations(pool);
        this.tweetOperations = new tweet_operations_1.PostgresTweetOperations(pool);
        this.analysisOperations = new analysis_operations_1.PostgresAnalysisOperations(pool);
        this.funnelOperations = new funnel_operations_1.PostgresFunnelOperations(pool);
        this.referralOperations = new referral_operations_1.PostgresReferralOperations(pool);
    }
    // Helper method to get a client with automatic release
    async withClient(operation) {
        const client = await this.connectionManager.getConnection();
        try {
            return await operation(client);
        }
        finally {
            client.release();
        }
    }
    // Helper method for monitored queries
    async monitoredQuery(client, query, params) {
        return await this.monitor.monitorQuery(client, query, params);
    }
    // User operations
    saveUserProfile(username, profile) {
        return this.userOperations.saveUserProfile(username, profile);
    }
    createUser(user) {
        return this.userOperations.createUser(user);
    }
    getUserById(id) {
        return this.userOperations.getUserById(id);
    }
    getUserByUsername(username) {
        return this.userOperations.getUserByUsername(username);
    }
    getUserByTwitterUsername(username) {
        return this.userOperations.getUserByTwitterUsername(username);
    }
    searchUsers(query) {
        return this.userOperations.searchUsers(query);
    }
    updateUser(id, data) {
        return this.userOperations.updateUser(id, data);
    }
    updateUserProfile(id, profileData) {
        return this.userOperations.updateUserProfile(id, profileData);
    }
    validateUsername(username) {
        return this.userOperations.validateUsername(username);
    }
    getUserCount() {
        return this.userOperations.getUserCount();
    }
    // Tweet operations
    saveTweets(userId, tweets) {
        return this.tweetOperations.saveTweets(userId, tweets);
    }
    createTweet(tweet) {
        return this.tweetOperations.createTweet(tweet);
    }
    getTweetsByUserId(userId, options) {
        return this.tweetOperations.getTweetsByUserId(userId, options);
    }
    getTweetById(id) {
        return this.tweetOperations.getTweetById(id);
    }
    getTweetsBatch(offset, limit) {
        return this.tweetOperations.getTweetsBatch(offset, limit);
    }
    searchTweets(query, options) {
        return this.tweetOperations.searchTweets(query, options);
    }
    getTweetCount(userId) {
        return this.tweetOperations.getTweetCount(userId);
    }
    getLatestTweet(userId) {
        return this.tweetOperations.getLatestTweet(userId);
    }
    // Analysis operations
    savePersonalityAnalysis(analysis) {
        return this.analysisOperations.savePersonalityAnalysis(analysis);
    }
    createAnalysisJob(userId, totalChunks) {
        return this.analysisOperations.createAnalysisJob(userId, totalChunks);
    }
    saveAnalysisChunk(jobId, chunk) {
        return this.analysisOperations.saveAnalysisChunk(jobId, chunk);
    }
    getLatestAnalysis(userId) {
        return this.analysisOperations.getLatestAnalysis(userId);
    }
    getAnalysisHistory(userId, limit) {
        return this.analysisOperations.getAnalysisHistory(userId, limit);
    }
    getAnalysisJob(jobId) {
        return this.analysisOperations.getAnalysisJob(jobId);
    }
    updateAnalysisStatus(jobId, status, error) {
        return this.analysisOperations.updateAnalysisStatus(jobId, status, error);
    }
    incrementProcessedChunks(jobId) {
        return this.analysisOperations.incrementProcessedChunks(jobId);
    }
    // Funnel operations
    saveFunnelProgress(progress) {
        return this.funnelOperations.saveFunnelProgress(progress);
    }
    updateFunnelProgress(userId, data) {
        return this.funnelOperations.updateFunnelProgress(userId, data);
    }
    markFunnelComplete(completion) {
        return this.funnelOperations.markFunnelComplete(completion);
    }
    getFunnelProgress(userId) {
        return this.funnelOperations.getFunnelProgress(userId);
    }
    getFunnelCompletion(userId) {
        return this.funnelOperations.getFunnelCompletion(userId);
    }
    getFunnelStats() {
        return this.funnelOperations.getFunnelStats();
    }
    // Referral operations
    createReferralCode(code) {
        return this.referralOperations.createReferralCode(code);
    }
    validateReferralCode(code) {
        return this.referralOperations.validateReferralCode(code);
    }
    trackReferralUse(tracking) {
        return this.referralOperations.trackReferralUse(tracking);
    }
    logReferralUsage(usage) {
        return this.referralOperations.logReferralUsage(usage);
    }
    getReferralStats(userId) {
        return this.referralOperations.getReferralStats(userId);
    }
    getReferralHistory(userId) {
        return this.referralOperations.getReferralHistory(userId);
    }
    incrementReferralUses(code) {
        return this.referralOperations.incrementReferralUses(code);
    }
    getTopReferrers(limit) {
        return this.referralOperations.getTopReferrers(limit);
    }
    // Transaction support
    async beginTransaction() {
        const client = await this.connectionManager.getConnection();
        const transaction = new PostgresTransaction(client, this.monitor);
        await transaction.begin();
        return transaction;
    }
    async connect() {
        try {
            // Test connection by getting and releasing a client
            const client = await this.connectionManager.getConnection();
            client.release();
        }
        catch (error) {
            if (error instanceof errors_1.DatabaseError) {
                throw error;
            }
            throw new errors_1.DatabaseError('Failed to connect to database', {
                name: 'ConnectionError',
                code: 'CONNECTION_FAILED',
                severity: 'ERROR',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async disconnect() {
        this.monitor.stop();
        await this.connectionManager.end();
    }
    async getStatus() {
        var _a;
        const health = await this.connectionManager.healthCheck();
        return {
            isConnected: health.isHealthy,
            lastConnected: health.lastHealthCheck,
            error: (_a = health.metrics.lastError) === null || _a === void 0 ? void 0 : _a.message
        };
    }
    async checkTables() {
        const client = await this.connectionManager.getConnection();
        try {
            // Check all required tables exist
            const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
            const requiredTables = [
                'users', 'tweets', 'personality_analysis',
                'funnel_progress', 'funnel_completion',
                'referral_tracking', 'referral_codes',
                'referral_usage_log', 'analysis_queue',
                'analysis_chunks'
            ];
            const existingTables = result.rows.map(row => row.table_name);
            return requiredTables.every(table => existingTables.includes(table));
        }
        finally {
            client.release();
        }
    }
    // Transaction Support
    async transaction(callback) {
        const client = await this.connectionManager.getConnection();
        const transaction = new PostgresTransaction(client, this.monitor);
        try {
            await transaction.begin();
            const result = await callback(transaction);
            await transaction.commit();
            return result;
        }
        catch (error) {
            await transaction.rollback();
            throw error;
        }
        finally {
            client.release();
        }
    }
    // Database Maintenance
    async vacuum() {
        await this.withClient(client => this.monitoredQuery(client, 'VACUUM ANALYZE'));
    }
    async analyze(table) {
        await this.withClient(client => this.monitoredQuery(client, table ? `ANALYZE ${table}` : 'ANALYZE'));
    }
    async healthCheck() {
        const health = await this.connectionManager.healthCheck();
        const metrics = this.monitor.getMetrics();
        return {
            isHealthy: health.isHealthy,
            details: Object.assign(Object.assign({}, metrics), { connectionHealth: {
                    lastHealthCheck: health.lastHealthCheck,
                    poolStatus: {
                        totalConnections: health.metrics.totalConnections,
                        activeConnections: health.metrics.activeConnections,
                        idleConnections: health.metrics.idleConnections,
                        waitingClients: health.metrics.waitingClients
                    }
                } })
        };
    }
}
exports.PostgresAdapter = PostgresAdapter;
