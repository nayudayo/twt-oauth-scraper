"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresAnalysisOperations = void 0;
const errors_1 = require("../errors");
class PostgresAnalysisOperations {
    constructor(pool) {
        this.pool = pool;
    }
    async savePersonalityAnalysis(analysis) {
        const client = await this.pool.connect();
        try {
            await client.query(`INSERT INTO personality_analysis (
          id, user_id, traits, interests, communication_style, analyzed_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`, [
                analysis.id,
                analysis.user_id,
                analysis.traits,
                analysis.interests,
                analysis.communication_style
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
    async createAnalysisJob(userId, totalChunks) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`INSERT INTO analysis_queue (
          user_id, total_chunks, status, priority
        ) VALUES ($1, $2, 'pending', 0)
        RETURNING job_id`, [userId, totalChunks]);
            return result.rows[0].job_id;
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
    async saveAnalysisChunk(jobId, chunk) {
        const client = await this.pool.connect();
        try {
            await client.query(`INSERT INTO analysis_chunks (
          job_id, chunk_index, tweet_count, result, status
        ) VALUES ($1, $2, $3, $4, 'completed')`, [jobId, chunk.index, chunk.tweetCount, chunk.result]);
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
    async getLatestAnalysis(userId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT * FROM personality_analysis WHERE user_id = $1 ORDER BY analyzed_at DESC LIMIT 1', [userId]);
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
    async getAnalysisHistory(userId, limit = 10) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT * FROM personality_analysis WHERE user_id = $1 ORDER BY analyzed_at DESC LIMIT $2', [userId, limit]);
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
    async getAnalysisJob(jobId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT status, processed_chunks, total_chunks, error FROM analysis_queue WHERE job_id = $1', [jobId]);
            if (!result.rows[0])
                return null;
            const { status, processed_chunks, total_chunks, error } = result.rows[0];
            return {
                status,
                progress: (processed_chunks / total_chunks) * 100,
                error
            };
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
    async updateAnalysisStatus(jobId, status, error) {
        const client = await this.pool.connect();
        try {
            await client.query(`UPDATE analysis_queue 
         SET status = $1, 
             error = $2,
             ${status === 'completed' ? 'completed_at = CURRENT_TIMESTAMP,' : ''}
             ${status === 'processing' ? 'started_at = CURRENT_TIMESTAMP,' : ''}
             updated_at = CURRENT_TIMESTAMP
         WHERE job_id = $3`, [status, error || null, jobId]);
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
    async incrementProcessedChunks(jobId) {
        const client = await this.pool.connect();
        try {
            await client.query(`UPDATE analysis_queue 
         SET processed_chunks = processed_chunks + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE job_id = $1`, [jobId]);
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
        return (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            'severity' in error);
    }
}
exports.PostgresAnalysisOperations = PostgresAnalysisOperations;
