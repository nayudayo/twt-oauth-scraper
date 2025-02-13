import { initDB } from '../src/lib/db/index'
import { Pool } from 'pg'

async function checkDatabase() {
  try {
    const db = await initDB()
    const pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DATABASE || 'twitter_analysis_db',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD
    })

    // Get all tables
    console.log('\n--- Tables in database ---')
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    
    for (const row of tables.rows) {
      console.log(`- ${row.table_name}`)
      
      // Get row count for each table
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${row.table_name}`)
      console.log(`  Rows: ${countResult.rows[0].count}`)
    }

    // Close connections
    await pool.end()
    await db.disconnect()
  } catch (error) {
    console.error('Failed to check database:', error)
  }
}

// Run the check
checkDatabase() 