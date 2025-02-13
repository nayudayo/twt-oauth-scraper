import { ApifyClient } from 'apify-client';
import * as dotenv from 'dotenv';
import { initDB } from './db/index';
import { ApifyTweet } from '@/types/apify';
import { TwitterProfile } from '@/types/scraper';
import { DBTweet, DBUser } from './db/adapters/types';

// Load environment variables from both files
dotenv.config({ path: '.env' });  // Load main .env first
dotenv.config({ path: '.env.local', override: true });  // Then load .env.local with override

// Initialize Apify client
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

interface TweetMetrics {
    likes?: number;
    retweets?: number;
    replies?: number;
}

function convertTweetFormat(tweet: ApifyTweet): DBTweet {
    const timestamp = typeof tweet.timestamp === 'string' ? new Date(tweet.timestamp) : 
                     typeof tweet.timestamp === 'number' ? new Date(tweet.timestamp) :
                     new Date();

    const metrics = typeof tweet.metrics === 'object' && tweet.metrics ? tweet.metrics as TweetMetrics : {};
    const images = Array.isArray(tweet.images) ? tweet.images : [];
    const url = typeof tweet.url === 'string' ? tweet.url : undefined;
    const text = typeof tweet.text === 'string' ? tweet.text : '';
    const id = typeof tweet.id === 'string' ? tweet.id : String(tweet.id || Date.now());
    const userId = typeof tweet.userId === 'string' ? tweet.userId : String(tweet.userId || 'unknown');

    return {
        id,
        user_id: userId,
        text,
        created_at: timestamp,
        url,
        is_reply: Boolean(tweet.isReply),
        metadata: {
            metrics: {
                likes: metrics.likes,
                retweets: metrics.retweets,
                replies: metrics.replies
            },
            images: images.filter((img): img is string => typeof img === 'string')
        },
        created_in_db: new Date()
    };
}

export async function scrapeTweetsForUser(username: string) {
    try {
        console.log('Starting tweet collection...');
        const apifyTweets = await getAllTweets(username);
        
        // Initialize database
        const db = await initDB();
        
        // Create profile first
        const profile: TwitterProfile = {
            name: username,
            bio: null,
            followersCount: null,
            followingCount: null,
            imageUrl: null
        };
        
        // Get profile picture URL from Apify data if available
        if (apifyTweets.length > 0 && apifyTweets[0].profilePicture) {
            profile.imageUrl = apifyTweets[0].profilePicture;
        }
        
        // Save user profile first and wait for it to complete
        console.log('Creating user profile...');
        const dbUser: Partial<DBUser> = {
            username: username,
            twitter_username: username, // Set Twitter username to the actual Twitter username
            profile_data: {
                bio: profile.bio || undefined,
                followersCount: profile.followersCount || undefined,
                followingCount: profile.followingCount || undefined
            },
            profile_picture_url: profile.imageUrl || undefined,
            created_at: new Date()
        };
        
        // First try to find existing user by OAuth username
        const existingUser = await db.getUserByUsername(username);
        if (existingUser) {
            // Update existing user with Twitter username
            await db.updateUser(existingUser.id, {
                twitter_username: username,
                profile_data: dbUser.profile_data,
                profile_picture_url: dbUser.profile_picture_url
            });
            console.log('Updated existing user with Twitter username');
        } else {
            // Create new user
            await db.saveUserProfile(username, dbUser);
            console.log('Created new user profile');
        }
        
        // Get the user's database ID
        const user = await db.getUserByUsername(username);
        if (!user) {
            throw new Error('Failed to retrieve user after creation');
        }
        
        // Then convert and save tweets with the correct user ID
        console.log('Converting and saving tweets...');
        const tweets = apifyTweets.map(tweet => ({
            ...convertTweetFormat(tweet),
            user_id: user.id  // Use the actual database user ID
        }));
        
        await db.saveTweets(username, tweets);
        
        console.log(`Successfully saved ${tweets.length} tweets for user ${username} to database`);
        return tweets;
    } catch (error) {
        console.error('Error during scraping:', error);
        throw error;
    }
}