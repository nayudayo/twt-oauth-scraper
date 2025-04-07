import {
  DBUser,
  DBTweet,
  DBPersonalityAnalysis,
  DBFunnelProgress,
  DBFunnelCompletion,
  DBReferralTracking,
  DBReferralCode,
  DBReferralUsage,
  DBTransaction
} from './types';

// User Operations
export interface UserOperations {
  // Create operations
  saveUserProfile(username: string, profile: Partial<DBUser>): Promise<void>;
  createUser(user: Partial<DBUser>): Promise<DBUser>;
  
  // Read operations
  getUserById(id: string): Promise<DBUser | null>;
  getUserByUsername(username: string): Promise<DBUser | null>;
  searchUsers(query: string): Promise<DBUser[]>;
  
  // Update operations
  updateUser(id: string, data: Partial<DBUser>): Promise<void>;
  updateUserProfile(id: string, profileData: Record<string, unknown>): Promise<void>;
  updateLastOperationTime(userId: string, operation: 'scrape' | 'analyze'): Promise<void>;
  
  // Utility operations
  validateUsername(username: string): Promise<boolean>;
  getUserCount(): Promise<number>;
  getCooldownStatus(userId: string, operation: 'scrape' | 'analyze'): Promise<{ canProceed: boolean; remainingTime?: number }>;
}

// Tweet Operations
export interface TweetOperations {
  // Create operations
  saveTweets(userId: string, tweets: DBTweet[]): Promise<void>;
  createTweet(tweet: DBTweet): Promise<void>;
  
  // Read operations
  getTweetsByUserId(userId: string, options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    includeReplies?: boolean;
  }): Promise<DBTweet[]>;
  getTweetById(id: string): Promise<DBTweet | null>;
  getTweetsBatch(offset: number, limit: number): Promise<DBTweet[]>;
  
  // Search operations
  searchTweets(query: string, options?: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<DBTweet[]>;
  
  // Delete operations
  deleteTweetsByUserId(userId: string): Promise<void>;
  
  // Utility operations
  getTweetCount(userId?: string): Promise<number>;
  getLatestTweet(userId: string): Promise<DBTweet | null>;
}

// Analysis Operations
export interface AnalysisOperations {
  // Create operations
  savePersonalityAnalysis(analysis: DBPersonalityAnalysis): Promise<void>;
  createAnalysisJob(userId: string, totalChunks: number): Promise<number>;
  saveAnalysisChunk(jobId: number, chunk: {
    index: number;
    result: Record<string, unknown>;
    tweetCount: number;
  }): Promise<void>;
  
  // Read operations
  getLatestAnalysis(userId: string): Promise<DBPersonalityAnalysis | null>;
  getAnalysisHistory(userId: string, limit?: number): Promise<DBPersonalityAnalysis[]>;
  getAnalysisJob(jobId: number): Promise<{
    status: string;
    progress: number;
    error?: string;
  } | null>;
  
  // Update operations
  updateAnalysisStatus(jobId: number, status: string, error?: string): Promise<void>;
  incrementProcessedChunks(jobId: number): Promise<void>;
}

// Funnel Operations
export interface FunnelOperations {
  // Create/Update operations
  saveFunnelProgress(progress: DBFunnelProgress): Promise<void>;
  updateFunnelProgress(userId: string, data: {
    commandIndex?: number;
    completedCommands?: string[];
    responses?: Record<string, string>;
  }): Promise<void>;
  markFunnelComplete(completion: DBFunnelCompletion): Promise<void>;
  
  // Read operations
  getFunnelProgress(userId: string): Promise<DBFunnelProgress | null>;
  getFunnelCompletion(userId: string): Promise<DBFunnelCompletion | null>;
  
  // Utility operations
  getFunnelStats(): Promise<{
    totalUsers: number;
    completedUsers: number;
    averageCompletionTime: number;
  }>;
}

// Referral Operations
export interface ReferralOperations {
  // Create operations
  createReferralCode(code: DBReferralCode): Promise<void>;
  validateReferralCode(code: string): Promise<boolean>;
  getReferralCodeDetails(code: string): Promise<DBReferralCode | null>;
  trackReferralUse(tracking: DBReferralTracking): Promise<void>;
  logReferralUsage(usage: DBReferralUsage): Promise<void>;
  
  // Read operations
  getReferralStats(userId: string): Promise<{
    codes: DBReferralCode[];
    usages: DBReferralUsage[];
    totalUses: number;
  }>;
  getReferralHistory(userId: string): Promise<{
    referred: DBReferralTracking[];
    referredBy: DBReferralTracking | null;
  }>;
  
  // Update operations
  incrementReferralUses(code: string): Promise<void>;
  
  // Utility operations
  getTopReferrers(limit?: number): Promise<Array<{
    userId: string;
    totalReferrals: number;
  }>>;
}

// Combined Database Operations Interface
export interface DatabaseOperations extends 
  UserOperations,
  TweetOperations,
  AnalysisOperations,
  FunnelOperations,
  ReferralOperations {
  
  // Transaction handling
  transaction<T>(callback: (transaction: DBTransaction) => Promise<T>): Promise<T>;
  
  // Utility operations
  healthCheck(): Promise<{
    isHealthy: boolean;
    details: Record<string, unknown>;
  }>;
  vacuum(): Promise<void>;
  analyze(table?: string): Promise<void>;
} 