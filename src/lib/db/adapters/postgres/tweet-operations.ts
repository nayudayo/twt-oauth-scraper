import { Pool } from 'pg';
import { DBTweet } from '../types';
import { DatabaseError, PostgresError } from '../errors';

interface TweetOperations {
  saveTweets(userId: string, tweets: DBTweet[]): Promise<void>;
  createTweet(tweet: DBTweet): Promise<void>;
  getTweetsByUserId(userId: string, options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    includeReplies?: boolean;
  }): Promise<DBTweet[]>;
  getTweetById(id: string): Promise<DBTweet | null>;
  getTweetsBatch(offset: number, limit: number): Promise<DBTweet[]>;
  searchTweets(query: string, options?: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<DBTweet[]>;
  getTweetCount(userId?: string): Promise<number>;
  getLatestTweet(userId: string): Promise<DBTweet | null>;
}

export class PostgresTweetOperations implements TweetOperations {
  constructor(private pool: Pool) {}

  // Create operations
  async saveTweets(userId: string, tweets: DBTweet[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Process tweets in batches to avoid memory issues
      const BATCH_SIZE = 100;
      for (let i = 0; i < tweets.length; i += BATCH_SIZE) {
        const batch = tweets.slice(i, i + BATCH_SIZE);
        
        // Use PostgreSQL's unnest for bulk insert
        const values = batch.map(tweet => ([
          tweet.id,
          tweet.user_id,
          tweet.text,
          tweet.created_at,
          tweet.url || null,
          tweet.is_reply,
          tweet.metadata || {}
        ]));

        await client.query(`
          INSERT INTO tweets (
            id, user_id, text, created_at, url, is_reply, metadata
          )
          SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::timestamp[], 
                              $5::text[], $6::boolean[], $7::jsonb[])
          ON CONFLICT (id) DO UPDATE SET
            text = EXCLUDED.text,
            url = EXCLUDED.url,
            is_reply = EXCLUDED.is_reply,
            metadata = tweets.metadata || EXCLUDED.metadata
        `, [
          values.map(v => v[0]),
          values.map(v => v[1]),
          values.map(v => v[2]),
          values.map(v => v[3]),
          values.map(v => v[4]),
          values.map(v => v[5]),
          values.map(v => v[6])
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async createTweet(tweet: DBTweet): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO tweets (
          id, user_id, text, created_at, url, is_reply, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          text = EXCLUDED.text,
          url = EXCLUDED.url,
          is_reply = EXCLUDED.is_reply,
          metadata = tweets.metadata || EXCLUDED.metadata`,
        [
          tweet.id,
          tweet.user_id,
          tweet.text,
          tweet.created_at,
          tweet.url || null,
          tweet.is_reply,
          tweet.metadata || {}
        ]
      );
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // Read operations
  async getTweetsByUserId(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      includeReplies?: boolean;
    } = {}
  ): Promise<DBTweet[]> {
    const client = await this.pool.connect();
    try {
      const conditions: string[] = ['user_id = $1'];
      const values: unknown[] = [userId];
      let paramCount = 2;

      if (options.startDate) {
        conditions.push(`created_at >= $${paramCount}`);
        values.push(options.startDate);
        paramCount++;
      }

      if (options.endDate) {
        conditions.push(`created_at <= $${paramCount}`);
        values.push(options.endDate);
        paramCount++;
      }

      if (options.includeReplies === false) {
        conditions.push('is_reply = false');
      }

      const query = `
        SELECT * FROM tweets
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        ${options.limit ? `LIMIT $${paramCount++}` : ''}
        ${options.offset ? `OFFSET $${paramCount++}` : ''}
      `;

      if (options.limit) values.push(options.limit);
      if (options.offset) values.push(options.offset);

      const result = await client.query(query, values);
      return result.rows;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getTweetById(id: string): Promise<DBTweet | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM tweets WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getTweetsBatch(offset: number, limit: number): Promise<DBTweet[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM tweets ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      return result.rows;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async searchTweets(
    query: string,
    options: {
      userId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<DBTweet[]> {
    const client = await this.pool.connect();
    try {
      const conditions: string[] = ['to_tsvector(\'english\', text) @@ plainto_tsquery(\'english\', $1)'];
      const values: unknown[] = [query];
      let paramCount = 2;

      if (options.userId) {
        conditions.push(`user_id = $${paramCount}`);
        values.push(options.userId);
        paramCount++;
      }

      if (options.startDate) {
        conditions.push(`created_at >= $${paramCount}`);
        values.push(options.startDate);
        paramCount++;
      }

      if (options.endDate) {
        conditions.push(`created_at <= $${paramCount}`);
        values.push(options.endDate);
        paramCount++;
      }

      const queryStr = `
        SELECT 
          id, user_id, text, created_at, url, is_reply, metadata, created_in_db,
          ts_rank(to_tsvector('english', text), plainto_tsquery('english', $1)) as rank
        FROM tweets
        WHERE ${conditions.join(' AND ')}
        ORDER BY rank DESC, created_at DESC
        ${options.limit ? `LIMIT $${paramCount++}` : ''}
        ${options.offset ? `OFFSET $${paramCount++}` : ''}
      `;

      if (options.limit) values.push(options.limit);
      if (options.offset) values.push(options.offset);

      const result = await client.query(queryStr, values);
      return result.rows;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // Utility operations
  async getTweetCount(userId?: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      if (userId) {
        const result = await client.query(
          'SELECT COUNT(*) FROM tweets WHERE user_id = $1',
          [userId]
        );
        return parseInt(result.rows[0].count);
      } else {
        const result = await client.query('SELECT COUNT(*) FROM tweets');
        return parseInt(result.rows[0].count);
      }
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getLatestTweet(userId: string): Promise<DBTweet | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM tweets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private isPostgresError(error: unknown): error is PostgresError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'severity' in error
    );
  }
} 