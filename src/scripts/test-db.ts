import { initDB } from '../lib/db/index'
import { createTwitterClient } from '../lib/twitter/client'
import { TwitterDataTransformer } from '../lib/twitter/transformer'
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
        console.log('- TWITTER_API_KEY:', process.env.TWITTER_API_KEY ? 'Found' : 'Not found')
        
        const db = await initDB()

        // Test fetching and saving
        const username = '_notlance' // Test user
        console.log(`\nFetching tweets for ${username}...`)
        
        // Initialize Twitter client
        const client = createTwitterClient(process.env.TWITTER_API_KEY!)
        
        // Get user profile
        const profile = await client.getUserProfile({ userName: username })
        console.log('Got user profile:', profile.name)
        
        // Save user profile
        const dbUser = TwitterDataTransformer.toDBUser(profile)
        await db.saveUserProfile(username, dbUser)
        
        // Get user's database ID
        const user = await db.getUserByUsername(username)
        if (!user) {
            console.error('User not found in database')
            return
        }

        // Fetch tweets
        const response = await client.getUserTweets({ userName: username })
        const tweets = response.tweets.map(tweet => TwitterDataTransformer.toDBTweet(tweet, user.id))
        
        // Save tweets
        await db.saveTweets(user.id, tweets)
        console.log(`Saved ${tweets.length} tweets`)

        // Test retrieving tweets
        console.log('\nRetrieving tweets from database...')
        const savedTweets = await db.getTweetsByUserId(user.id)
        console.log(`Retrieved ${savedTweets.length} tweets`)
        if (savedTweets.length > 0) {
            console.log('Sample tweet:', savedTweets[0])
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