import { parentPort, workerData } from 'worker_threads'
import { ApifyClient } from 'apify-client'
import * as dotenv from 'dotenv'
import type { Tweet, TwitterProfile } from '@/types/scraper'
import { analyzePersonality } from './openai'
import { initDB, saveUserProfile, saveTweets } from './db'

if (!parentPort) {
  throw new Error('This file must be run as a worker thread')
}

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' })

// Log token for debugging (we'll remove this after confirming it works)
console.log('Apify token in worker:', process.env.APIFY_API_TOKEN ? 'Found' : 'Not found')

// Define interface for raw Apify response item
interface RawApifyItem {
  id: unknown
  text: unknown
  createdAt: unknown
  url: unknown
  [key: string]: unknown
}

// Type guard for Apify tweet item
function isValidTweetItem(item: RawApifyItem): item is { id: string; text: string; createdAt: string; url: string } {
  return (
    typeof item.id === 'string' &&
    typeof item.text === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.url === 'string'
  )
}

// Initialize the ApifyClient with API token
dotenv.config()
const client = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
})

async function runScraper() {
  try {
    const { username: targetUsername } = workerData // This is the profile we want to scrape

    // Send initialization progress
    parentPort!.postMessage({ progress: 5, status: 'Starting Apify scraper...' })

    // Prepare Actor input
    const input = {
      "filter:blue_verified": false,
      "filter:consumer_video": false,
      "filter:has_engagement": false,
      "filter:hashtags": false,
      "filter:images": false,
      "filter:links": false,
      "filter:media": false,
      "filter:mentions": false,
      "filter:native_video": false,
      "filter:nativeretweets": false,
      "filter:news": false,
      "filter:pro_video": false,
      "filter:quote": false,
      "filter:replies": false,
      "filter:safe": false,
      "filter:spaces": false,
      "filter:twimg": false,
      "filter:verified": false,
      "filter:videos": false,
      "filter:vine": false,
      "from": targetUsername,
      "include:nativeretweets": true,
      "lang": "en",
      "maxItems": 500,
    }

    parentPort!.postMessage({ progress: 20, status: 'Starting tweet collection...' })

    // Collect tweets
    const allTweets: Tweet[] = []
    let offset = 0
    const batchSize = 500
    const seenTweetIds = new Set<string>()
    let unchangedCount = 0
    let totalAttempts = 0

    while (true) {
      totalAttempts++
      console.log(`\nAttempt ${totalAttempts}: Fetching batch starting at offset ${offset}...`)
      
      // Run the Actor with current offset
      const run = await client.actor("CJdippxWmn9uRfooo").call({
        ...input,
        maxItems: batchSize,
        offset: offset
      })

      // Fetch results from the dataset
      const { items } = await client.dataset(run.defaultDatasetId).listItems()
      const rawItems = items as RawApifyItem[]
      
      if (rawItems.length === 0) {
        console.log(`No more tweets found after ${totalAttempts} attempts.`)
        break
      }
      
      const beforeCount = seenTweetIds.size
      
      // Add only unique tweets
      rawItems.forEach(rawItem => {
        if (isValidTweetItem(rawItem) && !seenTweetIds.has(rawItem.id)) {
          seenTweetIds.add(rawItem.id)
          allTweets.push({
            id: rawItem.id,
            text: rawItem.text,
            url: rawItem.url,
            createdAt: rawItem.createdAt,
            timestamp: rawItem.createdAt,
            metrics: {
              likes: null,
              retweets: null,
              views: null
            },
            images: [],
            isReply: false // Apify API doesn't distinguish replies
          })
        }
      })
      
      const newUniqueCount = seenTweetIds.size
      console.log(`Attempt ${totalAttempts}: Fetched ${rawItems.length} tweets, ${newUniqueCount - beforeCount} new unique tweets. Total unique tweets so far: ${allTweets.length}`)
      
      // Send progress update
      parentPort!.postMessage({
        progress: Math.min(80, 20 + Math.floor((allTweets.length / 500) * 60)),
        status: 'Collecting tweets...',
        phase: 'posts',
        scanProgress: { phase: 'posts', count: allTweets.length }
      })

      // Check if we got any new unique tweets
      if (newUniqueCount === beforeCount) {
        unchangedCount++
        console.log(`No new unique tweets found. Failed attempts: ${unchangedCount}/2`)
        if (unchangedCount >= 2) {
          console.log(`Stopping after ${totalAttempts} total attempts - no new unique tweets in last 2 attempts.`)
          break
        }
      } else {
        unchangedCount = 0 // Reset counter if we found new unique tweets
      }
      
      // Only check batch size after at least 2 attempts
      if (totalAttempts >= 2 && rawItems.length < batchSize) {
        console.log(`Last batch was not full. Stopping after ${totalAttempts} attempts.`)
        break
      }
      
      offset += batchSize
    }

    console.log(`\nFinished fetching after ${totalAttempts} attempts. Total unique tweets: ${allTweets.length}`)

    // Create profile data with number types for storage
    const profile: TwitterProfile = {
      name: targetUsername,
      bio: null,
      followersCount: null,
      followingCount: null
    }

    // Initialize database and save tweets
    const db = await initDB()
    await saveUserProfile(db, targetUsername, profile)
    await saveTweets(db, targetUsername, allTweets)
    console.log('Tweets saved to database')

    // Convert profile for analysis
    const analysisProfile = {
      ...profile,
      followersCount: profile.followersCount?.toString() ?? null,
      followingCount: profile.followingCount?.toString() ?? null
    }

    // Send progress update
    parentPort!.postMessage({
      progress: 90,
      status: 'Tweet collection complete',
      phase: 'complete',
      scanProgress: { phase: 'complete', count: allTweets.length },
      tweets: allTweets
    })

    // Perform personality analysis
    console.log('🧠 Analyzing personality...')
    parentPort!.postMessage({
      progress: 95,
      status: 'Analyzing personality...',
      phase: 'analysis',
      scanProgress: { phase: 'analysis', count: allTweets.length }
    })

    const analysis = await analyzePersonality(allTweets, analysisProfile)

    // Send final data
    parentPort!.postMessage({
      progress: 100,
      status: 'Complete',
      type: 'complete',
      data: {
        profile,
        tweets: allTweets,
        analysis
      }
    })

    // Add explicit completion message
    parentPort!.postMessage({
      type: 'done',
      progress: 100,
      status: 'Scraping and analysis completed'
    })

  } catch (error) {
    console.error('❌ Scrape error:', error)
    parentPort!.postMessage({ 
      error: error instanceof Error ? error.message : 'Scrape failed',
      progress: 0
    })
  }
}

// Start the scraping process
runScraper() 