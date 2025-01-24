import { initDB } from '../src/lib/db'

async function checkDatabase() {
  try {
    const db = await initDB()
    
    // Get all tables
    console.log('\n--- Tables in database ---')
    const tables = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table'
    `)
    console.log('Tables:', tables.map(t => t.name))

    // Check users table
    console.log('\n--- Users ---')
    const users = await db.all('SELECT * FROM users')
    console.log('Users count:', users.length)
    console.log('Sample users:', users.slice(0, 2))

    // Check tweets table
    console.log('\n--- Tweets ---')
    const tweets = await db.all('SELECT COUNT(*) as count FROM tweets')
    console.log('Total tweets:', tweets[0].count)
    const sampleTweets = await db.all('SELECT * FROM tweets LIMIT 2')
    console.log('Sample tweets:', sampleTweets)

    // Check personality_analysis table
    console.log('\n--- Personality Analysis ---')
    const analyses = await db.all('SELECT * FROM personality_analysis')
    console.log('Analyses count:', analyses.length)
    console.log('Sample analyses:', analyses.slice(0, 2))

  } catch (error) {
    console.error('Error checking database:', error)
  }
}

checkDatabase() 