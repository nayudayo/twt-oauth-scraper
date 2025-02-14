import { DatabaseFactory } from './factory';
import { DatabaseError } from './adapters/errors';
import { Pool } from 'pg';
import { ConversationDB } from './conversation';
import type { PostgresAdapter } from './adapters/postgres';
import type { DBConfig } from './factory';

// Re-export types
export { DatabaseError } from './adapters/errors';
export type { PostgresAdapter } from './adapters/postgres';

let dbInstance: PostgresAdapter | null = null;
let pool: Pool | null = null;
let conversationDB: ConversationDB | null = null;

export interface ExtendedDB extends PostgresAdapter {
  conversation: ConversationDB;
}

export async function initDB(): Promise<ExtendedDB> {
  try {
    if (dbInstance && pool && conversationDB) {
      return Object.assign(dbInstance, { conversation: conversationDB });
    }

    // Initialize pool if not exists
    if (!pool) {
      pool = new Pool({
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        host: process.env.PG_HOST,
        database: process.env.PG_DATABASE,
        port: parseInt(process.env.PG_PORT || '5432')
      });
    }

    // Initialize base database instance
    const config: DBConfig = {
      type: 'postgres',
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DATABASE || 'postgres',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || ''
    };

    const db = await DatabaseFactory.initialize(config);

    // Initialize conversation DB if not exists
    if (!conversationDB) {
      conversationDB = new ConversationDB(pool);
    }

    dbInstance = db;
    return Object.assign(db, { conversation: conversationDB });
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
  }
}

export type { ConversationDB }; 