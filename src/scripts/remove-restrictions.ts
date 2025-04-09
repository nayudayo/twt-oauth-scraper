import { pool } from '../db/pool'
import { logger } from '../utils/logger'

async function removeRestrictions() {
  try {
    const client = await pool.connect()
    
    try {
      // Start transaction
      await client.query('BEGIN')
      
      // Delete from scraping_history
      await client.query('DELETE FROM scraping_history')
      logger.info('Cleared scraping_history table')
      
      // Delete from analysis_history
      await client.query('DELETE FROM analysis_history')
      logger.info('Cleared analysis_history table')
      
      // Delete from rate_limits
      await client.query('DELETE FROM rate_limits')
      logger.info('Cleared rate_limits table')
      
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