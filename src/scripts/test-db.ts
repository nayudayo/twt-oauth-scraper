import { scrapeTweetsForUser } from '../lib/apify-scraper'
import { initDB } from '../lib/db/index'
import * as dotenv from 'dotenv'

// Load environment variables from both files
dotenv.config({ path: '.env' });  // Load main .env first
dotenv.config({ path: '.env.local', override: true });  // Then load .env.local with override

async function testDatabase() {
    try {
        // Initialize database
        console.log('Initializing database...')
        console.log('Environment check:')
        console.log('- PG_PASSWORD:', process.env.PG_PASSWORD ? 'Found' : 'Not found')
        console.log('- APIFY_API_TOKEN:', process.env.APIFY_API_TOKEN ? 'Found' : 'Not found')
        
        const db = await initDB()

        // Test scraping and saving
        const username = '_notlance' // Test user
        console.log(`\nScraping tweets for ${username}...`)
        await scrapeTweetsForUser(username)

        // Get user's database ID first
        const user = await db.getUserByUsername(username)
        if (!user) {
            console.error('User not found in database')
            return
        }

        // Test retrieving tweets using the correct user ID
        console.log('\nRetrieving tweets from database...')
        const tweets = await db.getTweetsByUserId(user.id)
        console.log(`Retrieved ${tweets.length} tweets`)
        if (tweets.length > 0) {
            console.log('Sample tweet:', tweets[0])
        }

        // Test getting analysis (should be null since we haven't saved any)
        console.log('\nTesting analysis retrieval...')
        const analysis = await db.getLatestAnalysis(username)
        console.log('Latest analysis:', analysis)

    } catch (error) {
        console.error('Test failed:', error)
    }
}

// Run the test
testDatabase().then(() => console.log('\nTest complete')) 