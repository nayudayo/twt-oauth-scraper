import { pool } from '../db/pool'
import { logger } from '../utils/logger'

async function removeRestrictions() {
  try {
    const client = await pool.connect()
    
    try {
      // Start transaction
      await client.query('BEGIN')
      
      // Delete from analysis_queue
      await client.query('DELETE FROM analysis_queue')
      logger.info('Cleared analysis_queue table')
      
      // Delete from analysis_chunks
      await client.query('DELETE FROM analysis_chunks')
      logger.info('Cleared analysis_chunks table')
      
      // Delete from personality_analysis_queue
      await client.query('DELETE FROM personality_analysis_queue')
      logger.info('Cleared personality_analysis_queue table')
      
      // Delete from personality_analysis_chunks
      await client.query('DELETE FROM personality_analysis_chunks')
      logger.info('Cleared personality_analysis_chunks table')
      
      // Delete from analytics_results
      await client.query('DELETE FROM analytics_results')
      logger.info('Cleared analytics_results table')
      
      // Commit transaction
      await client.query('COMMIT')
      logger.success('Successfully removed all restrictions')
      
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK')
      logger.error('Error removing restrictions:', error)
      throw error
    } finally {
      client.release()
    }
    
  } catch (error) {
    logger.error('Failed to connect to database:', error)
    throw error
  } finally {
    await pool.end()
  }
}

// Run the script
removeRestrictions().catch((error) => {
  logger.error('Script failed:', error)
  process.exit(1)
}) 