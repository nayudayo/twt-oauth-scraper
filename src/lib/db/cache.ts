import { Pool } from 'pg';
import { DatabaseError } from './adapters/errors';
import type { PersonalityCache } from '../../types/cache';

export class PersonalityCacheDB {
  constructor(private pool: Pool) {}

  /**
   * Get a user's cached personality analysis
   * @param userId - The user's ID
   * @returns The cached personality data or null if not found/stale
   */
  async getPersonalityCache(userId: string): Promise<PersonalityCache | null> {
    const client = await this.pool.connect();
    try {
      // Get cache with freshness check (7 days)
      const result = await client.query(
        `SELECT * FROM personality_cache 
         WHERE user_id = $1 
         AND NOT is_stale 
         AND updated_at > NOW() - INTERVAL '7 days'`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        id: result.rows[0].id,
        userId: result.rows[0].user_id,
        analysisData: result.rows[0].analysis_data,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at,
        version: result.rows[0].version,
        isStale: result.rows[0].is_stale
      };
    } catch (error) {
      console.error('Error fetching personality cache:', error);
      throw new DatabaseError('Failed to fetch personality cache');
    } finally {
      client.release();
    }
  }

  /**
   * Save or update a user's personality analysis cache
   * @param userId - The user's ID
   * @param analysisData - The personality analysis data to cache
   * @param version - Optional version number for the cache
   */
  async savePersonalityCache(
    userId: string,
    analysisData: Record<string, unknown>,
    version: number = 1
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Use upsert to handle both insert and update cases
      await client.query(
        `INSERT INTO personality_cache 
         (user_id, analysis_data, version, is_stale, updated_at) 
         VALUES ($1, $2, $3, false, NOW())
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           analysis_data = EXCLUDED.analysis_data,
           version = EXCLUDED.version,
           is_stale = false,
           updated_at = NOW()`,
        [userId, analysisData, version]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving personality cache:', error);
      throw new DatabaseError('Failed to save personality cache');
    } finally {
      client.release();
    }
  }

  /**
   * Mark a user's personality cache as stale
   * @param userId - The user's ID
   */
  async invalidateCache(userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'UPDATE personality_cache SET is_stale = true WHERE user_id = $1',
        [userId]
      );
    } catch (error) {
      console.error('Error invalidating personality cache:', error);
      throw new DatabaseError('Failed to invalidate personality cache');
    } finally {
      client.release();
    }
  }

  /**
   * Delete a user's personality cache
   * @param userId - The user's ID
   */
  async deleteCache(userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'DELETE FROM personality_cache WHERE user_id = $1',
        [userId]
      );
    } catch (error) {
      console.error('Error deleting personality cache:', error);
      throw new DatabaseError('Failed to delete personality cache');
    } finally {
      client.release();
    }
  }

  /**
   * Check if a significant change exists between current and new analysis
   * @param current - Current analysis data
   * @param updated - New analysis data
   * @returns true if significant changes exist
   */
  private hasSignificantChanges(
    current: Record<string, unknown>,
    updated: Record<string, unknown>
  ): boolean {
    // Compare trait scores
    const currentTraits = (current.traits as Array<{ name: string; score: number }>) || [];
    const updatedTraits = (updated.traits as Array<{ name: string; score: number }>) || [];

    // Check for 20% or more difference in any trait score
    for (const currentTrait of currentTraits) {
      const updatedTrait = updatedTraits.find(t => t.name === currentTrait.name);
      if (!updatedTrait) continue;

      const difference = Math.abs(currentTrait.score - updatedTrait.score);
      if (difference >= 2) { // 20% of max score (10)
        return true;
      }
    }

    return false;
  }
} 