import { Pool } from 'pg';
import { DBFunnelProgress, DBFunnelCompletion } from '../types';
import { DatabaseError, PostgresError } from '../errors';

interface FunnelOperations {
  saveFunnelProgress(progress: DBFunnelProgress): Promise<void>;
  updateFunnelProgress(userId: string, data: {
    commandIndex?: number;
    completedCommands?: string[];
    responses?: Record<string, string>;
  }): Promise<void>;
  markFunnelComplete(completion: DBFunnelCompletion): Promise<void>;
  getFunnelProgress(userId: string): Promise<DBFunnelProgress | null>;
  getFunnelCompletion(userId: string): Promise<DBFunnelCompletion | null>;
  getFunnelStats(): Promise<{
    totalUsers: number;
    completedUsers: number;
    averageCompletionTime: number;
  }>;
}

export class PostgresFunnelOperations implements FunnelOperations {
  constructor(private pool: Pool) {}

  async saveFunnelProgress(progress: DBFunnelProgress): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO funnel_progress (
          user_id, current_command_index, completed_commands, command_responses, last_updated
        ) VALUES ($1, $2, $3::jsonb, $4::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET
          current_command_index = EXCLUDED.current_command_index,
          completed_commands = EXCLUDED.completed_commands,
          command_responses = EXCLUDED.command_responses,
          last_updated = CURRENT_TIMESTAMP`,
        [
          progress.user_id,
          progress.current_command_index,
          JSON.stringify(progress.completed_commands),
          JSON.stringify(progress.command_responses)
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

  async updateFunnelProgress(userId: string, data: {
    commandIndex?: number;
    completedCommands?: string[];
    responses?: Record<string, string>;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      // First, check if the user has a funnel progress entry
      const existingProgress = await client.query(
        'SELECT * FROM funnel_progress WHERE user_id = $1',
        [userId]
      );

      if (!existingProgress.rows[0]) {
        // Create new entry if it doesn't exist
        await client.query(
          `INSERT INTO funnel_progress (
            user_id, 
            current_command_index, 
            completed_commands, 
            command_responses, 
            last_updated
          ) VALUES ($1, $2, $3::jsonb, $4::jsonb, CURRENT_TIMESTAMP)`,
          [
            userId,
            data.commandIndex || 0,
            JSON.stringify(data.completedCommands || []),
            JSON.stringify(data.responses || {})
          ]
        );
        return;
      }

      // Update existing entry
      const updates: string[] = [];
      const values: unknown[] = [userId];
      let paramCount = 2;

      if (data.commandIndex !== undefined) {
        updates.push(`current_command_index = $${paramCount}`);
        values.push(data.commandIndex);
        paramCount++;
      }

      if (data.completedCommands) {
        updates.push(`completed_commands = $${paramCount}::jsonb`);
        values.push(JSON.stringify(data.completedCommands));
        paramCount++;
      }

      if (data.responses) {
        // Create a new merged object for responses
        const currentResponses = existingProgress.rows[0].command_responses || {};
        const newResponses = { ...currentResponses, ...data.responses };
        updates.push(`command_responses = $${paramCount}::jsonb`);
        values.push(JSON.stringify(newResponses));
        paramCount++;
      }

      if (updates.length === 0) return;

      updates.push('last_updated = CURRENT_TIMESTAMP');

      await client.query(
        `UPDATE funnel_progress 
         SET ${updates.join(', ')}
         WHERE user_id = $1`,
        values
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

  async markFunnelComplete(completion: DBFunnelCompletion): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO funnel_completion (
          user_id, completed_at, completion_data
        ) VALUES ($1, CURRENT_TIMESTAMP, $2)
        ON CONFLICT (user_id) DO UPDATE SET
          completion_data = EXCLUDED.completion_data,
          completed_at = CURRENT_TIMESTAMP`,
        [completion.user_id, completion.completion_data]
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

  async getFunnelProgress(userId: string): Promise<DBFunnelProgress | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM funnel_progress WHERE user_id = $1',
        [userId]
      );
      
      if (!result.rows[0]) return null;

      // Convert snake_case to camelCase
      const row = result.rows[0];
      return {
        user_id: row.user_id,
        current_command_index: row.current_command_index,
        completed_commands: row.completed_commands || [],
        command_responses: row.command_responses || {},
        last_updated: row.last_updated
      };
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getFunnelCompletion(userId: string): Promise<DBFunnelCompletion | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM funnel_completion WHERE user_id = $1',
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

  async getFunnelStats(): Promise<{
    totalUsers: number;
    completedUsers: number;
    averageCompletionTime: number;
  }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        WITH funnel_metrics AS (
          SELECT
            COUNT(DISTINCT fp.user_id) as total_users,
            COUNT(DISTINCT fc.user_id) as completed_users,
            AVG(
              EXTRACT(EPOCH FROM (fc.completed_at - fp.last_updated)) / 3600
            ) as avg_completion_hours
          FROM funnel_progress fp
          LEFT JOIN funnel_completion fc ON fp.user_id = fc.user_id
        )
        SELECT
          total_users,
          completed_users,
          COALESCE(avg_completion_hours, 0) as average_completion_time
        FROM funnel_metrics
      `);

      const { total_users, completed_users, average_completion_time } = result.rows[0];
      return {
        totalUsers: parseInt(total_users),
        completedUsers: parseInt(completed_users),
        averageCompletionTime: parseFloat(average_completion_time)
      };
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