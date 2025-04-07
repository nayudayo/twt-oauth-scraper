import { DatabaseAdapter, DBTransaction } from './types';
import { DatabaseError } from './errors';
import { PostgresConnectionManager } from './postgres/connection-manager';
import { PostgresUserOperations } from './postgres/user-operations';
import { PostgresTweetOperations } from './postgres/tweet-operations';
import { PostgresAnalysisOperations } from './postgres/analysis-operations';
import { PostgresFunnelOperations } from './postgres/funnel-operations';
import { PostgresReferralOperations } from './postgres/referral-operations';
import { PoolClient } from 'pg';
import { DatabaseMonitor } from '../monitoring';
import {
  DBUser,
  DBTweet,
  DBPersonalityAnalysis,
  DBFunnelProgress,
  DBFunnelCompletion,
  DBReferralTracking,
  DBReferralCode,
  DBReferralUsage
} from './types';

// PostgreSQL Transaction Implementation
class PostgresTransaction implements DBTransaction {
  private transactionId: string;
  public client: PoolClient;  // Changed to public to match interface

  constructor(
    client: PoolClient,
    private monitor?: DatabaseMonitor
  ) {
    this.client = client;
    this.transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  async begin(): Promise<void> {
    await this.client.query('BEGIN');
    this.monitor?.startTransaction(this.transactionId);
  }

  async commit(): Promise<void> {
    await this.client.query('COMMIT');
    this.monitor?.endTransaction(this.transactionId, 'committed');
  }

  async rollback(): Promise<void> {
    await this.client.query('ROLLBACK');
    this.monitor?.endTransaction(this.transactionId, 'rolled_back');
  }
}

// Connection Pool Configuration
interface PoolConfig {
  maxConnections?: number;
  minConnections?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
  retryIntervalMs?: number;
  maxRetries?: number;
}

const DEFAULT_POOL_CONFIG: Required<PoolConfig> = {
  maxConnections: 20,
  minConnections: 2,
  connectionTimeoutMs: 10000,
  idleTimeoutMs: 30000,
  retryIntervalMs: 1000,
  maxRetries: 3
};

export class PostgresAdapter implements DatabaseAdapter {
  private connectionManager: PostgresConnectionManager;
  private monitor: DatabaseMonitor;
  private lastConnected: Date | null = null;
  private connectionError: Error | null = null;
  private readonly config: Required<PoolConfig>;
  private readonly userOperations: PostgresUserOperations;
  private readonly tweetOperations: PostgresTweetOperations;
  private readonly analysisOperations: PostgresAnalysisOperations;
  private readonly funnelOperations: PostgresFunnelOperations;
  private readonly referralOperations: PostgresReferralOperations;

  constructor(
    connectionString: string,
    config?: {
      maxConnections?: number;
      minConnections?: number;
      connectionTimeoutMs?: number;
      idleTimeoutMs?: number;
      monitoring?: {
        slowQueryThreshold?: number;
        maxLogSize?: number;
        metricsInterval?: number;
      };
    }
  ) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.connectionManager = new PostgresConnectionManager(connectionString, config);
    
    // Get pool from connection manager
    const pool = this.connectionManager.getPool();
    
    // Initialize monitoring
    this.monitor = new DatabaseMonitor(pool, config?.monitoring);
    
    // Initialize operations with pool
    this.userOperations = new PostgresUserOperations(pool);
    this.tweetOperations = new PostgresTweetOperations(pool);
    this.analysisOperations = new PostgresAnalysisOperations(pool);
    this.funnelOperations = new PostgresFunnelOperations(pool);
    this.referralOperations = new PostgresReferralOperations(pool);
  }

  // Helper method to get a client with automatic release
  private async withClient<T>(
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.connectionManager.getConnection();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  }

  // Helper method for monitored queries
  private async monitoredQuery<T>(
    client: PoolClient,
    query: string,
    params?: unknown[]
  ): Promise<T> {
    return await this.monitor.monitorQuery(client, query, params) as T;
  }

  // User operations
  saveUserProfile(username: string, profile: Partial<DBUser>): Promise<void> {
    return this.userOperations.saveUserProfile(username, profile);
  }

  createUser(user: Partial<DBUser>): Promise<DBUser> {
    return this.userOperations.createUser(user);
  }

  getUserById(id: string): Promise<DBUser | null> {
    return this.userOperations.getUserById(id);
  }

  getUserByUsername(username: string): Promise<DBUser | null> {
    return this.userOperations.getUserByUsername(username);
  }

  getUserByTwitterUsername(username: string): Promise<DBUser | null> {
    return this.userOperations.getUserByTwitterUsername(username);
  }

  searchUsers(query: string): Promise<DBUser[]> {
    return this.userOperations.searchUsers(query);
  }

  updateUser(id: string, data: Partial<DBUser>): Promise<void> {
    return this.userOperations.updateUser(id, data);
  }

  updateUserProfile(id: string, profileData: Record<string, unknown>): Promise<void> {
    return this.userOperations.updateUserProfile(id, profileData);
  }

  validateUsername(username: string): Promise<boolean> {
    return this.userOperations.validateUsername(username);
  }

  getUserCount(): Promise<number> {
    return this.userOperations.getUserCount();
  }

  // Tweet operations
  saveTweets(userId: string, tweets: DBTweet[]): Promise<void> {
    return this.tweetOperations.saveTweets(userId, tweets);
  }

  deleteTweetsByUserId(userId: string): Promise<void> {
    return this.tweetOperations.deleteTweetsByUserId(userId);
  }

  createTweet(tweet: DBTweet): Promise<void> {
    return this.tweetOperations.createTweet(tweet);
  }

  getTweetsByUserId(userId: string, options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    includeReplies?: boolean;
  }): Promise<DBTweet[]> {
    return this.tweetOperations.getTweetsByUserId(userId, options);
  }

  getTweetById(id: string): Promise<DBTweet | null> {
    return this.tweetOperations.getTweetById(id);
  }

  getTweetsBatch(offset: number, limit: number): Promise<DBTweet[]> {
    return this.tweetOperations.getTweetsBatch(offset, limit);
  }

  searchTweets(query: string, options?: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<DBTweet[]> {
    return this.tweetOperations.searchTweets(query, options);
  }

  getTweetCount(userId?: string): Promise<number> {
    return this.tweetOperations.getTweetCount(userId);
  }

  getLatestTweet(userId: string): Promise<DBTweet | null> {
    return this.tweetOperations.getLatestTweet(userId);
  }

  // Analysis operations
  savePersonalityAnalysis(analysis: DBPersonalityAnalysis): Promise<void> {
    return this.analysisOperations.savePersonalityAnalysis(analysis);
  }

  createAnalysisJob(userId: string, totalChunks: number): Promise<number> {
    return this.analysisOperations.createAnalysisJob(userId, totalChunks);
  }

  saveAnalysisChunk(jobId: number, chunk: {
    index: number;
    result: Record<string, unknown>;
    tweetCount: number;
  }): Promise<void> {
    return this.analysisOperations.saveAnalysisChunk(jobId, chunk);
  }

  getLatestAnalysis(userId: string): Promise<DBPersonalityAnalysis | null> {
    return this.analysisOperations.getLatestAnalysis(userId);
  }

  getAnalysisHistory(userId: string, limit?: number): Promise<DBPersonalityAnalysis[]> {
    return this.analysisOperations.getAnalysisHistory(userId, limit);
  }

  getAnalysisJob(jobId: number): Promise<{
    status: string;
    progress: number;
    error?: string;
  } | null> {
    return this.analysisOperations.getAnalysisJob(jobId);
  }

  updateAnalysisStatus(jobId: number, status: string, error?: string): Promise<void> {
    return this.analysisOperations.updateAnalysisStatus(jobId, status, error);
  }

  incrementProcessedChunks(jobId: number): Promise<void> {
    return this.analysisOperations.incrementProcessedChunks(jobId);
  }

  // Funnel operations
  saveFunnelProgress(progress: DBFunnelProgress): Promise<void> {
    return this.funnelOperations.saveFunnelProgress(progress);
  }

  updateFunnelProgress(userId: string, data: {
    commandIndex?: number;
    completedCommands?: string[];
    responses?: Record<string, string>;
  }): Promise<void> {
    return this.funnelOperations.updateFunnelProgress(userId, data);
  }

  markFunnelComplete(completion: DBFunnelCompletion): Promise<void> {
    return this.funnelOperations.markFunnelComplete(completion);
  }

  getFunnelProgress(userId: string): Promise<DBFunnelProgress | null> {
    return this.funnelOperations.getFunnelProgress(userId);
  }

  getFunnelCompletion(userId: string): Promise<DBFunnelCompletion | null> {
    return this.funnelOperations.getFunnelCompletion(userId);
  }

  getFunnelStats(): Promise<{
    totalUsers: number;
    completedUsers: number;
    averageCompletionTime: number;
  }> {
    return this.funnelOperations.getFunnelStats();
  }

  // Referral operations
  async getReferralCodeDetails(code: string): Promise<DBReferralCode | null> {
    return this.referralOperations.getReferralCodeDetails(code);
  }

  async createReferralCode(code: DBReferralCode): Promise<void> {
    return this.referralOperations.createReferralCode(code);
  }

  async validateReferralCode(code: string): Promise<boolean> {
    return this.referralOperations.validateReferralCode(code);
  }

  async trackReferralUse(tracking: DBReferralTracking): Promise<void> {
    return this.referralOperations.trackReferralUse(tracking);
  }

  async logReferralUsage(usage: DBReferralUsage): Promise<void> {
    return this.referralOperations.logReferralUsage(usage);
  }

  async getReferralStats(userId: string): Promise<{
    codes: DBReferralCode[];
    usages: DBReferralUsage[];
    totalUses: number;
  }> {
    return this.referralOperations.getReferralStats(userId);
  }

  async getReferralHistory(userId: string): Promise<{
    referred: DBReferralTracking[];
    referredBy: DBReferralTracking | null;
  }> {
    return this.referralOperations.getReferralHistory(userId);
  }

  async incrementReferralUses(code: string): Promise<void> {
    return this.referralOperations.incrementReferralUses(code);
  }

  async getTopReferrers(limit?: number): Promise<Array<{
    userId: string;
    totalReferrals: number;
  }>> {
    return this.referralOperations.getTopReferrers(limit);
  }

  // Transaction support
  async beginTransaction(): Promise<DBTransaction> {
    const client = await this.connectionManager.getConnection();
    const transaction = new PostgresTransaction(client, this.monitor);
    await transaction.begin();
    return transaction;
  }

  async connect(): Promise<void> {
    try {
      // Test connection by getting and releasing a client
      const client = await this.connectionManager.getConnection();
      client.release();
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError('Failed to connect to database', {
        name: 'ConnectionError',
        code: 'CONNECTION_FAILED',
        severity: 'ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async disconnect(): Promise<void> {
    this.monitor.stop();
    await this.connectionManager.end();
  }

  async getStatus(): Promise<{
    isConnected: boolean;
    lastConnected?: Date;
    error?: string;
  }> {
    const health = await this.connectionManager.healthCheck();
    return {
      isConnected: health.isHealthy,
      lastConnected: health.lastHealthCheck,
      error: health.metrics.lastError?.message
    };
  }

  async checkTables(): Promise<boolean> {
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
    } finally {
      client.release();
    }
  }

  // Transaction Support
  async transaction<T>(
    callback: (transaction: DBTransaction) => Promise<T>
  ): Promise<T> {
    const client = await this.connectionManager.getConnection();
    const transaction = new PostgresTransaction(client, this.monitor);
    
    try {
      await transaction.begin();
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      client.release();
    }
  }

  // Database Maintenance
  async vacuum(): Promise<void> {
    await this.withClient(client => 
      this.monitoredQuery(client, 'VACUUM ANALYZE')
    );
  }

  async analyze(table?: string): Promise<void> {
    await this.withClient(client => 
      this.monitoredQuery(client, table ? `ANALYZE ${table}` : 'ANALYZE')
    );
  }

  async healthCheck(): Promise<{
    isHealthy: boolean;
    details: Record<string, unknown>;
  }> {
    const health = await this.connectionManager.healthCheck();
    const metrics = this.monitor.getMetrics();

    return {
      isHealthy: health.isHealthy,
      details: {
        ...metrics,
        connectionHealth: {
          lastHealthCheck: health.lastHealthCheck,
          poolStatus: {
            totalConnections: health.metrics.totalConnections,
            activeConnections: health.metrics.activeConnections,
            idleConnections: health.metrics.idleConnections,
            waitingClients: health.metrics.waitingClients
          }
        }
      }
    };
  }

  // Add cooldown operations
  async updateLastOperationTime(userId: string, operation: 'scrape' | 'analyze'): Promise<void> {
    return this.userOperations.updateLastOperationTime(userId, operation);
  }

  async getCooldownStatus(userId: string, operation: 'scrape' | 'analyze'): Promise<{ canProceed: boolean; remainingTime?: number }> {
    return this.userOperations.getCooldownStatus(userId, operation);
  }
} 