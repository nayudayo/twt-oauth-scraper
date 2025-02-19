import { DatabaseFactory } from './factory';
import { DatabaseError } from './adapters/errors';
import { Pool } from 'pg';
import { ConversationDB } from './conversation';
import { AccessCodeDB } from './access';
import { PersonalityCacheDB } from './cache';
import type { PostgresAdapter } from './adapters/postgres';
import type { DBConfig } from './factory';

// Re-export types
export { DatabaseError } from './adapters/errors';
export type { PostgresAdapter } from './adapters/postgres';

let dbInstance: PostgresAdapter | null = null;
let conversationDB: ConversationDB | null = null;
let accessDB: AccessCodeDB | null = null;
let personalityCache: PersonalityCacheDB | null = null;

export interface ExtendedDB extends PostgresAdapter {
  conversation: ConversationDB;
  access: AccessCodeDB;
  personality: PersonalityCacheDB;
}

export async function initDB(config?: DBConfig): Promise<ExtendedDB> {
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
    dbInstance = await DatabaseFactory.initialize(config || {
      type: 'postgres',
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DATABASE || 'postgres',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || ''
    });

    // Create a new pool for our operations
    const pool = new Pool({
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      host: process.env.PG_HOST,
      database: process.env.PG_DATABASE,
      port: parseInt(process.env.PG_PORT || '5432')
    });

    // Initialize sub-systems
    conversationDB = new ConversationDB(pool);
    accessDB = new AccessCodeDB(pool);
    personalityCache = new PersonalityCacheDB(pool);

    // Extend the adapter with our operations
    return Object.assign(dbInstance, {
      conversation: conversationDB,
      access: accessDB,
      personality: personalityCache
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw new DatabaseError('Failed to initialize database');
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
    conversationDB = null;
    accessDB = null;
    personalityCache = null;
  }
}

export type { ConversationDB, AccessCodeDB, PersonalityCacheDB }; 