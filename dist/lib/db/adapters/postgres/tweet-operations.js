"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresTweetOperations = void 0;
const errors_1 = require("../errors");
class PostgresTweetOperations {
    constructor(pool) {
        this.pool = pool;
    }
    // Create operations
    async saveTweets(userId, tweets) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Deduplicate tweets by ID, keeping the latest version
            const uniqueTweets = tweets.reduce((acc, tweet) => {
                // If we already have this tweet ID, only keep it if it's newer
                const existing = acc.get(tweet.id);
                if (!existing || tweet.created_at > existing.created_at) {
                    acc.set(tweet.id, tweet);
                }
                return acc;
            }, new Map());
            // Convert back to array
            const deduplicatedTweets = Array.from(uniqueTweets.values());
            // Process tweets in batches to avoid memory issues
            const BATCH_SIZE = 100;
            for (let i = 0; i < deduplicatedTweets.length; i += BATCH_SIZE) {
                const batch = deduplicatedTweets.slice(i, i + BATCH_SIZE);
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
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async createTweet(tweet) {
        const client = await this.pool.connect();
        try {
            await client.query(`INSERT INTO tweets (
          id, user_id, text, created_at, url, is_reply, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          text = EXCLUDED.text,
          url = EXCLUDED.url,
          is_reply = EXCLUDED.is_reply,
          metadata = tweets.metadata || EXCLUDED.metadata`, [
                tweet.id,
                tweet.user_id,
                tweet.text,
                tweet.created_at,
                tweet.url || null,
                tweet.is_reply,
                tweet.metadata || {}
            ]);
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    // Read operations
    async getTweetsByUserId(userId, options = {}) {
        const client = await this.pool.connect();
        try {
            const conditions = ['user_id = $1'];
            const values = [userId];
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
            if (options.limit)
                values.push(options.limit);
            if (options.offset)
                values.push(options.offset);
            const result = await client.query(query, values);
            return result.rows;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getTweetById(id) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT * FROM tweets WHERE id = $1', [id]);
            return result.rows[0] || null;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getTweetsBatch(offset, limit) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT * FROM tweets ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
            return result.rows;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async searchTweets(query, options = {}) {
        const client = await this.pool.connect();
        try {
            const conditions = ['to_tsvector(\'english\', text) @@ plainto_tsquery(\'english\', $1)'];
            const values = [query];
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
            if (options.limit)
                values.push(options.limit);
            if (options.offset)
                values.push(options.offset);
            const result = await client.query(queryStr, values);
            return result.rows;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    // Utility operations
    async getTweetCount(userId) {
        const client = await this.pool.connect();
        try {
            if (userId) {
                const result = await client.query('SELECT COUNT(*) FROM tweets WHERE user_id = $1', [userId]);
                return parseInt(result.rows[0].count);
            }
            else {
                const result = await client.query('SELECT COUNT(*) FROM tweets');
                return parseInt(result.rows[0].count);
            }
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getLatestTweet(userId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT * FROM tweets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
            return result.rows[0] || null;
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async deleteTweetsByUserId(userId) {
        const client = await this.pool.connect();
        try {
            await client.query('DELETE FROM tweets WHERE user_id = $1', [userId]);
        }
        catch (error) {
            if (this.isPostgresError(error)) {
                throw errors_1.DatabaseError.fromPgError(error);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    isPostgresError(error) {
        return error instanceof Error && 'code' in error;
    }
}
exports.PostgresTweetOperations = PostgresTweetOperations;
