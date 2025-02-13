import { Pool } from 'pg';
import { DBPersonalityAnalysis } from '../types';
import { DatabaseError, PostgresError } from '../errors';

interface AnalysisOperations {
  savePersonalityAnalysis(analysis: DBPersonalityAnalysis): Promise<void>;
  createAnalysisJob(userId: string, totalChunks: number): Promise<number>;
  saveAnalysisChunk(jobId: number, chunk: {
    index: number;
    result: Record<string, unknown>;
    tweetCount: number;
  }): Promise<void>;
  getLatestAnalysis(userId: string): Promise<DBPersonalityAnalysis | null>;
  getAnalysisHistory(userId: string, limit?: number): Promise<DBPersonalityAnalysis[]>;
  getAnalysisJob(jobId: number): Promise<{
    status: string;
    progress: number;
    error?: string;
  } | null>;
  updateAnalysisStatus(jobId: number, status: string, error?: string): Promise<void>;
  incrementProcessedChunks(jobId: number): Promise<void>;
}

export class PostgresAnalysisOperations implements AnalysisOperations {
  constructor(private pool: Pool) {}

  async savePersonalityAnalysis(analysis: DBPersonalityAnalysis): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO personality_analysis (
          id, user_id, traits, interests, communication_style, analyzed_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [
          analysis.id,
          analysis.user_id,
          analysis.traits,
          analysis.interests,
          analysis.communication_style
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

  async createAnalysisJob(userId: string, totalChunks: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO analysis_queue (
          user_id, total_chunks, status, priority
        ) VALUES ($1, $2, 'pending', 0)
        RETURNING job_id`,
        [userId, totalChunks]
      );
      return result.rows[0].job_id;
    } catch (error) {
      if (this.isPostgresError(error)) {
        throw DatabaseError.fromPgError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async saveAnalysisChunk(jobId: number, chunk: {
    index: number;
    result: Record<string, unknown>;
    tweetCount: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO analysis_chunks (
          job_id, chunk_index, tweet_count, result, status
        ) VALUES ($1, $2, $3, $4, 'completed')`,
        [jobId, chunk.index, chunk.tweetCount, chunk.result]
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

  async getLatestAnalysis(userId: string): Promise<DBPersonalityAnalysis | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM personality_analysis WHERE user_id = $1 ORDER BY analyzed_at DESC LIMIT 1',
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

  async getAnalysisHistory(userId: string, limit = 10): Promise<DBPersonalityAnalysis[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM personality_analysis WHERE user_id = $1 ORDER BY analyzed_at DESC LIMIT $2',
        [userId, limit]
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

  async getAnalysisJob(jobId: number): Promise<{
    status: string;
    progress: number;
    error?: string;
  } | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT status, processed_chunks, total_chunks, error FROM analysis_queue WHERE job_id = $1',
        [jobId]
      );
      
      if (!result.rows[0]) return null;
      
      const { status, processed_chunks, total_chunks, error } = result.rows[0];
      return {
        status,
        progress: (processed_chunks / total_chunks) * 100,
        error
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

  async updateAnalysisStatus(jobId: number, status: string, error?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE analysis_queue 
         SET status = $1, 
             error = $2,
             ${status === 'completed' ? 'completed_at = CURRENT_TIMESTAMP,' : ''}
             ${status === 'processing' ? 'started_at = CURRENT_TIMESTAMP,' : ''}
             updated_at = CURRENT_TIMESTAMP
         WHERE job_id = $3`,
        [status, error || null, jobId]
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

  async incrementProcessedChunks(jobId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE analysis_queue 
         SET processed_chunks = processed_chunks + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE job_id = $1`,
        [jobId]
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

  private isPostgresError(error: unknown): error is PostgresError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'severity' in error
    );
  }
} 