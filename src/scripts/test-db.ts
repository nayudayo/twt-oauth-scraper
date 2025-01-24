import { scrapeTweetsForUser } from '../lib/apify-scraper'
import { initDB, getUserTweets, getLatestAnalysis } from '../lib/db'

async function testDatabase() {
    try {
        // Initialize database
        console.log('Initializing database...')
        const db = await initDB()

        // Test scraping and saving
        const username = '_notlance' // Test user
        console.log(`\nScraping tweets for ${username}...`)
        await scrapeTweetsForUser(username)

        // Test retrieving tweets
        console.log('\nRetrieving tweets from database...')
        const tweets = await getUserTweets(db, username)
        console.log(`Retrieved ${tweets.length} tweets`)
        console.log('Sample tweet:', tweets[0])

        // Test getting analysis (should be null since we haven't saved any)
        console.log('\nTesting analysis retrieval...')
        const analysis = await getLatestAnalysis(db, username)
        console.log('Latest analysis:', analysis)

    } catch (error) {
        console.error('Test failed:', error)
    }
}

// Run the test
testDatabase().then(() => console.log('\nTest complete')) 