import { DatabaseOperations } from './operations';

// User Types
export interface DBUser {
  id: string;
  username: string;
  twitter_username?: string;
  profile_data?: {
    bio?: string;
    followersCount?: number;
    followingCount?: number;
  };
  profile_picture_url?: string;
  last_scraped?: Date;
  created_at: Date;
}

// Tweet Types
export interface DBTweet {
  id: string;
  user_id: string;
  text: string;
  created_at: Date;
  url?: string;
  is_reply: boolean;
  metadata?: {
    metrics?: {
      likes?: number;
      retweets?: number;
      replies?: number;
    };
    images?: string[];
  };
  created_in_db: Date;
}

// Analysis Types
export interface DBPersonalityAnalysis {
  id: string;
  user_id: string;
  traits: Array<{
    name: string;
    score: number;
    explanation?: string;
  }>;
  interests: string[];
  communication_style: {
    formality: number;
    enthusiasm: number;
    technicalLevel: number;
    emojiUsage: number;
  };
  analyzed_at: Date;
}

// Funnel Types
export interface DBFunnelProgress {
  user_id: string;
  current_command_index: number;
  completed_commands: string[];
  command_responses: { [key: string]: string };
  last_updated: Date;
}

export interface DBFunnelCompletion {
  user_id: string;
  completed_at: Date;
  completion_data: {
    telegram_username?: string;
    wallet_address?: string;
    referral_code?: string;
  };
}

// Referral Types
export interface DBReferralTracking {
  id: number;
  referral_code: string;
  referrer_user_id: string;
  referred_user_id: string;
  used_at: Date;
}

export interface DBReferralCode {
  code: string;
  owner_user_id: string;
  usage_count: number;
  created_at: Date;
}

export interface DBReferralUsage {
  id: number;
  referral_code: string;
  used_by_user_id: string;
  used_at: Date;
}

// Transaction Types
export interface DBTransaction {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// Connection Types
export interface ConnectionStatus {
  isConnected: boolean;
  lastConnected?: Date;
  error?: string;
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

// Base Database Adapter Interface
export interface DatabaseAdapter extends DatabaseOperations {
  // Connection Management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<ConnectionStatus>;
  checkTables(): Promise<boolean>;

  // Transaction Support
  beginTransaction(): Promise<DBTransaction>;

  // Will add operation methods in the next step...
} 