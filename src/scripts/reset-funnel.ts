import { pool } from '../db/pool'
import { logger } from '../utils/logger'

async function resetFunnel() {
  try {
    const client = await pool.connect()
    
    try {
      // Start transaction
      await client.query('BEGIN')
      
      // Delete from funnel_completion
      await client.query('DELETE FROM funnel_completion')
      logger.info('Cleared funnel_completion table')
      
      // Delete from funnel_progress
      await client.query('DELETE FROM funnel_progress')
      logger.info('Cleared funnel_progress table')
      
      // Commit transaction
      await client.query('COMMIT')
      logger.success('Successfully reset funnel data')
      
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK')
      logger.error('Error resetting funnel data:', error)
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
resetFunnel().catch((error) => {
  logger.error('Script failed:', error)
  process.exit(1)
}) 