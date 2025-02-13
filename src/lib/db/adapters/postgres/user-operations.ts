import { Pool } from 'pg';
import { DBUser } from '../types';
import { DatabaseError, PostgresError } from '../errors';
import { DatabaseMonitor } from '../../monitoring';

interface UserOperations {
  saveUserProfile(username: string, profile: Partial<DBUser>): Promise<void>;
  createUser(user: Partial<DBUser>): Promise<DBUser>;
  getUserById(id: string): Promise<DBUser | null>;
  getUserByUsername(username: string): Promise<DBUser | null>;
  getUserByTwitterUsername(username: string): Promise<DBUser | null>;
  searchUsers(query: string): Promise<DBUser[]>;
  updateUser(id: string, data: Partial<DBUser>): Promise<void>;
  updateUserProfile(id: string, profileData: Record<string, unknown>): Promise<void>;
  validateUsername(username: string): Promise<boolean>;
  getUserCount(): Promise<number>;
}

export class PostgresUserOperations implements UserOperations {
  private monitor: DatabaseMonitor;

  constructor(
    private pool: Pool,
    monitoringConfig?: {
      slowQueryThreshold?: number;
      maxLogSize?: number;
      metricsInterval?: number;
    }
  ) {
    this.monitor = new DatabaseMonitor(pool, monitoringConfig);
  }

  // Helper method for monitored queries
  private async monitoredQuery<T>(
    query: string,
    params?: unknown[]
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await this.monitor.monitorQuery(client, query, params) as T;
    } finally {
      client.release();
    }
  }

  // Create operations
  async saveUserProfile(username: string, profile: Partial<DBUser>): Promise<void> {
    try {
      const result = await this.monitoredQuery<{ rows: DBUser[] }>(
        'SELECT id FROM users WHERE username = $1 OR twitter_username = $1',
        [username]
      );

      if (result.rows.length > 0) {
        // Update existing user
        await this.monitoredQuery(
          `UPDATE users 
           SET profile_data = $1, 
               profile_picture_url = $2,
               twitter_username = COALESCE($3, twitter_username),
               last_scraped = CURRENT_TIMESTAMP
           WHERE username = $4 OR twitter_username = $4`,
          [
            profile.profile_data,
            profile.profile_picture_url,
            profile.twitter_username,
            username
          ]
        );
      } else {
        // Create new user
        await this.monitoredQuery(
          `INSERT INTO users (
            id, username, twitter_username, profile_data, profile_picture_url, last_scraped
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [
            profile.id || `user_${Date.now()}`,
            username,
            profile.twitter_username || null,
            profile.profile_data,
            profile.profile_picture_url
          ]
        );
      }
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    }
  }

  async createUser(user: Partial<DBUser>): Promise<DBUser> {
    try {
      const result = await this.monitoredQuery<{ rows: DBUser[] }>(
        `INSERT INTO users (
          id, username, twitter_username, profile_data, profile_picture_url, last_scraped, created_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          user.id || `user_${Date.now()}`,
          user.username,
          user.twitter_username || null,
          user.profile_data || {},
          user.profile_picture_url
        ]
      );

      return result.rows[0];
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    }
  }

  // Read operations
  async getUserById(id: string): Promise<DBUser | null> {
    try {
      const result = await this.monitoredQuery<{ rows: DBUser[] }>(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<DBUser | null> {
    try {
      const result = await this.monitoredQuery<{ rows: DBUser[] }>(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    }
  }

  async getUserByTwitterUsername(username: string): Promise<DBUser | null> {
    try {
      const result = await this.monitoredQuery<{ rows: DBUser[] }>(
        'SELECT * FROM users WHERE twitter_username = $1',
        [username]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    }
  }

  async searchUsers(query: string): Promise<DBUser[]> {
    try {
      const result = await this.monitoredQuery<{ rows: DBUser[] }>(
        `SELECT * FROM users 
         WHERE username ILIKE $1 
         OR profile_data::text ILIKE $1
         ORDER BY username
         LIMIT 50`,
        [`%${query}%`]
      );

      return result.rows;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    }
  }

  // Update operations
  async updateUser(id: string, data: Partial<DBUser>): Promise<void> {
    try {
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 1;

      // Build dynamic update query
      if (data.username) {
        updates.push(`username = $${paramCount}`);
        values.push(data.username);
        paramCount++;
      }
      if (data.profile_data) {
        updates.push(`profile_data = $${paramCount}`);
        values.push(data.profile_data);
        paramCount++;
      }
      if (data.profile_picture_url) {
        updates.push(`profile_picture_url = $${paramCount}`);
        values.push(data.profile_picture_url);
        paramCount++;
      }
      if (data.last_scraped) {
        updates.push(`last_scraped = $${paramCount}`);
        values.push(data.last_scraped);
        paramCount++;
      }

      if (updates.length === 0) return;

      values.push(id);
      await this.monitoredQuery(
        `UPDATE users 
         SET ${updates.join(', ')} 
         WHERE id = $${paramCount}`,
        values
      );
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    }
  }

  async updateUserProfile(id: string, profileData: Record<string, unknown>): Promise<void> {
    try {
      await this.monitoredQuery(
        `UPDATE users 
         SET profile_data = profile_data || $1::jsonb
         WHERE id = $2`,
        [profileData, id]
      );
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    }
  }

  // Utility operations
  async validateUsername(username: string): Promise<boolean> {
    try {
      const result = await this.monitoredQuery<{ rows: [{ exists: boolean }] }>(
        'SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)',
        [username]
      );

      return !result.rows[0].exists;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    }
  }

  async getUserCount(): Promise<number> {
    try {
      const result = await this.monitoredQuery<{ rows: [{ count: string }] }>(
        'SELECT COUNT(*) FROM users'
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
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