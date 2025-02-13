import { PostgresAdapter } from './adapters/postgres';
import { DatabaseFactory } from './factory';
import { DatabaseError } from './adapters/errors';

// Re-export types
export type { DatabaseAdapter } from './adapters/types';
export type { DBUser, DBTweet, DBPersonalityAnalysis, DBFunnelProgress, DBFunnelCompletion, DBReferralTracking, DBReferralCode, DBReferralUsage } from './adapters/types';
export { DatabaseError } from './adapters/errors';
export type { PostgresAdapter } from './adapters/postgres';

// Default database configuration
const DEFAULT_CONFIG = {
  type: 'postgres' as const,
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'twitter_analysis_db',
  user: process.env.PG_USER || 'postgres',
  maxConnections: parseInt(process.env.PG_MAX_CONNECTIONS || '20'),
  minConnections: parseInt(process.env.PG_MIN_CONNECTIONS || '2'),
  connectionTimeoutMs: parseInt(process.env.PG_CONNECTION_TIMEOUT || '10000'),
  idleTimeoutMs: parseInt(process.env.PG_IDLE_TIMEOUT || '30000')
};

let dbInstance: PostgresAdapter | null = null;

export async function initDB(): Promise<PostgresAdapter> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    // Validate required environment variables
    if (!process.env.PG_PASSWORD) {
      throw new DatabaseError('Database password not provided in environment variables');
    }

    // Initialize database with configuration
    const db = await DatabaseFactory.initialize({
      ...DEFAULT_CONFIG,
      password: process.env.PG_PASSWORD,
      // Allow overriding connection string from environment
      connectionString: process.env.DATABASE_URL
    });

    dbInstance = db;
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

export async function getDB(): Promise<PostgresAdapter> {
  if (!dbInstance) {
    throw new DatabaseError('Database not initialized. Call initDB() first.');
  }
  return dbInstance;
}

export async function closeDB(): Promise<void> {
  if (dbInstance) {
    await DatabaseFactory.shutdown();
    dbInstance = null;
  }
} 