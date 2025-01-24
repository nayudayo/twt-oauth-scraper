import { ApifyClient } from 'apify-client';
import * as dotenv from 'dotenv';
import { initDB, saveTweets, saveUserProfile } from './db';
import { ApifyTweet } from '@/types/apify';
import { Tweet, TwitterProfile } from '@/types/scraper';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Initialize the ApifyClient with API token
const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Log token for debugging (we'll remove this after confirming it works)
console.log('Apify token:', process.env.APIFY_API_TOKEN ? 'Found' : 'Not found');

async function getAllTweets(username: string): Promise<ApifyTweet[]> {
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
        "filter:replies": false,  // Allow replies
        "filter:safe": false,
        "filter:spaces": false,
        "filter:twimg": false,
        "filter:verified": false,
        "filter:videos": false,
        "filter:vine": false,
        "from": username,
        "include:nativeretweets": true,
        "lang": "en",
        "maxItems": 500,  // Increased batch size
    };

    const allTweets: ApifyTweet[] = [];
    let offset = 0;
    const batchSize = 500;
    const seenTweetIds = new Set<string>();
    let unchangedCount = 0;
    let totalAttempts = 0;
    
    while (true) {
        totalAttempts++;
        console.log(`\nAttempt ${totalAttempts}: Fetching batch starting at offset ${offset}...`);
        
        // Run the Actor with current offset
        const run = await client.actor("CJdippxWmn9uRfooo").call({
            ...input,
            maxItems: batchSize,
            offset: offset
        });

        // Fetch results from the dataset
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (items.length === 0) {
            console.log(`No more tweets found after ${totalAttempts} attempts.`);
            break;
        }
        
        const beforeCount = seenTweetIds.size;
        
        // Add only unique tweets
        (items as ApifyTweet[]).forEach((item: ApifyTweet) => {
            if (!seenTweetIds.has(item.id)) {
                seenTweetIds.add(item.id);
                allTweets.push(item);
            }
        });
        
        const newUniqueCount = seenTweetIds.size;
        console.log(`Attempt ${totalAttempts}: Fetched ${items.length} tweets, ${newUniqueCount - beforeCount} new unique tweets. Total unique tweets so far: ${allTweets.length}`);
        
        // Check if we got any new unique tweets
        if (newUniqueCount === beforeCount) {
            unchangedCount++;
            console.log(`No new unique tweets found. Failed attempts: ${unchangedCount}/2`);
            if (unchangedCount >= 2) {
                console.log(`Stopping after ${totalAttempts} total attempts - no new unique tweets in last 2 attempts.`);
                break;
            }
        } else {
            unchangedCount = 0; // Reset counter if we found new unique tweets
        }
        
        // Only check batch size after at least 2 attempts
        if (totalAttempts >= 2 && items.length < batchSize) {
            console.log(`Last batch was not full. Stopping after ${totalAttempts} attempts.`);
            break;
        }
        
        offset += batchSize;
    }
    
    console.log(`\nFinished fetching after ${totalAttempts} attempts. Total unique tweets: ${allTweets.length}`);
    return allTweets;
}

// Convert Apify tweet to database tweet format
function convertTweetFormat(tweet: ApifyTweet): Tweet {
    return {
        id: tweet.id,
        url: tweet.url,
        text: tweet.text,
        createdAt: tweet.createdAt,
        timestamp: tweet.createdAt,
        isReply: tweet.isReply || false,
        metrics: {
            likes: null,
            retweets: null,
            views: null
        },
        images: [],
        mentions: [],
        hashtags: []
    };
}

export async function scrapeTweetsForUser(username: string) {
    try {
        console.log('Starting tweet collection...');
        const apifyTweets = await getAllTweets(username);
        
        // Initialize database
        const db = await initDB();
        
        // Convert tweets to database format
        const tweets = apifyTweets.map(convertTweetFormat);
        
        // Create profile
        const profile: TwitterProfile = {
            name: username,
            bio: null,
            followersCount: null,
            followingCount: null
        };
        
        // Save user profile
        await saveUserProfile(db, username, profile);
        
        // Save tweets to database
        await saveTweets(db, username, tweets);
        
        console.log(`Successfully saved ${tweets.length} tweets for user ${username} to database`);
        return tweets;
    } catch (error) {
        console.error('Error during scraping:', error);
        throw error;
    }
}