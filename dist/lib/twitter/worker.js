"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const client_1 = require("./client");
const transformer_1 = require("./transformer");
const db_1 = require("../db");
if (!worker_threads_1.parentPort) {
    throw new Error('This file must be run as a worker thread');
}
// Add termination signal handling
let isTerminating = false;
if (worker_threads_1.parentPort) {
    worker_threads_1.parentPort.on('message', (message) => {
        if (message.type === 'terminate') {
            console.log('Received termination signal');
            isTerminating = true;
        }
    });
}
// Add this helper function at the top level
function formatDate(dateStr) {
    if (!dateStr) {
        return new Date();
    }
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return new Date();
        }
        return date;
    }
    catch (_a) {
        return new Date();
    }
}
async function runTwitterScraper() {
    var _a;
    let db = null;
    try {
        const { username: targetUsername, apiKey } = worker_threads_1.workerData;
        // Debug logging for API key
        console.log('Worker received API key:', {
            hasApiKey: Boolean(apiKey),
            keyPrefix: apiKey ? apiKey.substring(0, 4) + '...' : 'undefined',
            envApiKey: process.env.TWITTER_API_KEY ? process.env.TWITTER_API_KEY.substring(0, 4) + '...' : 'undefined'
        });
        if (!apiKey) {
            throw new Error('API key not provided to worker');
        }
        const BATCH_SIZE = 20; // Twitter API's batch size
        const MAX_BATCHES = 25; // Limit to 25 batches
        const maxTweets = BATCH_SIZE * MAX_BATCHES; // 500 tweets total
        // Send initialization progress
        worker_threads_1.parentPort.postMessage({
            progress: 5,
            status: 'Initializing Twitter API client...',
            phase: 'init',
            scanProgress: { phase: 'init', count: 0, total: maxTweets }
        });
        // Initialize Twitter client with API key from workerData
        const client = new client_1.TwitterAPIClient(apiKey);
        // Get user profile first
        worker_threads_1.parentPort.postMessage({
            progress: 10,
            status: 'Fetching user profile...',
            phase: 'profile',
            scanProgress: { phase: 'profile', count: 0, total: maxTweets }
        });
        const profile = await client.getUserProfile({ userName: targetUsername });
        // Check for termination
        if (isTerminating) {
            throw new Error('Operation cancelled by user');
        }
        // Start tweet collection
        worker_threads_1.parentPort.postMessage({
            progress: 20,
            status: 'Starting tweet collection...',
            phase: 'posts',
            scanProgress: { phase: 'posts', count: 0, total: maxTweets }
        });
        // Use a Map to handle deduplication during collection
        const tweetMap = new Map();
        let hasNextPage = true;
        let nextCursor;
        let totalCollected = 0;
        let batchCount = 0;
        let reachedEndOfTweets = false;
        console.log('Starting tweet collection for:', targetUsername, 'with limit:', maxTweets, '(', MAX_BATCHES, 'batches of', BATCH_SIZE, 'tweets)');
        while (hasNextPage && totalCollected < maxTweets && batchCount < MAX_BATCHES && !isTerminating) {
            batchCount++;
            console.log(`Processing batch ${batchCount}/${MAX_BATCHES}`);
            // Get tweets for current page
            const response = await client.getUserTweets({
                userName: targetUsername,
                cursor: nextCursor,
                includeReplies: true
            });
            // Check if we've reached the end of available tweets
            if (!response.hasNextPage || response.tweets.length === 0) {
                reachedEndOfTweets = true;
            }
            // Transform and deduplicate tweets
            const validTweets = response.tweets.filter(tweet => tweet.id);
            // Calculate how many tweets we can still add without exceeding the limit
            const remainingQuota = maxTweets - totalCollected;
            const tweetsToAdd = validTweets.slice(0, Math.min(remainingQuota, BATCH_SIZE));
            // Add new tweets to the map
            for (const tweet of tweetsToAdd) {
                if (!tweetMap.has(tweet.id)) {
                    tweetMap.set(tweet.id, tweet);
                    totalCollected++;
                }
            }
            console.log('Collection progress:', {
                batchNumber: batchCount,
                batchSize: tweetsToAdd.length,
                totalCollected,
                remainingQuota: maxTweets - totalCollected,
                remainingBatches: MAX_BATCHES - batchCount,
                hasMore: response.hasNextPage && totalCollected < maxTweets && batchCount < MAX_BATCHES,
                nextCursor: response.nextCursor,
                reachedEndOfTweets: !response.hasNextPage || response.tweets.length === 0
            });
            // Send progress update
            worker_threads_1.parentPort.postMessage({
                progress: Math.min(80, 20 + Math.floor((batchCount / MAX_BATCHES) * 60)),
                status: `Collecting tweets - Batch ${batchCount}/${MAX_BATCHES} (${totalCollected} tweets)`,
                phase: 'posts',
                scanProgress: {
                    phase: 'posts',
                    count: totalCollected,
                    total: maxTweets,
                    currentBatch: batchCount,
                    totalBatches: MAX_BATCHES
                },
                tweets: tweetsToAdd,
                isChunk: true,
                chunkIndex: batchCount,
                totalBatches: MAX_BATCHES
            });
            // Get metrics for monitoring
            const metrics = client.getMetrics(`/user/tweets?userName=${targetUsername}`);
            if (((_a = metrics.rateLimitStatus) === null || _a === void 0 ? void 0 : _a.remaining) === 0) {
                // Send rate limit warning
                worker_threads_1.parentPort.postMessage({
                    type: 'warning',
                    message: 'Rate limit reached, waiting for reset',
                    reset: metrics.rateLimitStatus.reset
                });
            }
            // Update pagination state
            hasNextPage = response.hasNextPage && totalCollected < maxTweets && batchCount < MAX_BATCHES;
            nextCursor = response.nextCursor;
            // If we got fewer tweets than expected in a batch, we've likely reached the end
            if (response.tweets.length < BATCH_SIZE) {
                console.log('Received partial batch:', {
                    expectedBatchSize: BATCH_SIZE,
                    actualBatchSize: response.tweets.length,
                    totalCollected,
                    currentBatch: batchCount
                });
                reachedEndOfTweets = true;
            }
            // Add a small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        const completionStatus = reachedEndOfTweets
            ? `Reached end of available tweets at ${totalCollected} tweets (${batchCount} batches)`
            : batchCount >= MAX_BATCHES
                ? `Reached batch limit of ${MAX_BATCHES} batches (${totalCollected} tweets)`
                : `Reached tweet limit of ${maxTweets} tweets (${batchCount} batches)`;
        console.log('Tweet collection completed:', {
            totalTweets: tweetMap.size,
            totalBatches: batchCount,
            reachedBatchLimit: batchCount >= MAX_BATCHES,
            reachedTweetLimit: totalCollected >= maxTweets,
            reachedEndOfTweets,
            completionReason: completionStatus
        });
        // Convert Map back to array
        const allTweets = Array.from(tweetMap.values());
        // Check for termination before database operations
        if (isTerminating) {
            throw new Error('Operation cancelled by user');
        }
        // Initialize database
        db = await (0, db_1.initDB)({
            type: 'postgres',
            host: process.env.PG_HOST,
            port: parseInt(process.env.PG_PORT || '5432'),
            database: process.env.PG_DATABASE,
            user: process.env.PG_USER,
            password: process.env.PG_PASSWORD,
            connectionTimeoutMs: 30000, // Increase timeout to 30 seconds
            maxConnections: 5, // Limit connections for worker
            minConnections: 1,
            monitoring: {
                slowQueryThreshold: 5000, // 5 seconds
                metricsInterval: 10000 // 10 seconds
            }
        });
        // Create user profile with retry logic
        let retryCount = 0;
        const MAX_RETRIES = 3;
        while (retryCount < MAX_RETRIES) {
            try {
                // Create user profile
                const dbUser = {
                    username: targetUsername,
                    twitter_username: targetUsername,
                    profile_data: {
                        bio: profile.description,
                        name: profile.name,
                        id: profile.id,
                        createdAt: profile.createdAt
                    },
                    profile_picture_url: profile.profilePicture,
                    created_at: new Date(),
                    last_scraped: new Date()
                };
                // Save user profile
                await db.saveUserProfile(targetUsername, dbUser);
                // Get user to get the ID
                const user = await db.getUserByUsername(targetUsername);
                if (!user) {
                    throw new Error('Failed to create user profile');
                }
                // Convert tweets to database format using transformer
                const dbTweets = allTweets.map(tweet => (Object.assign(Object.assign({}, transformer_1.TwitterDataTransformer.toDBTweet(tweet, user.id)), { created_at: formatDate(tweet.createdAt) // Now returns a Date object
                 })));
                // Save tweets in smaller database batches with delay between batches
                const DB_BATCH_SIZE = 50; // Reduced batch size
                for (let i = 0; i < dbTweets.length; i += DB_BATCH_SIZE) {
                    const batch = dbTweets.slice(i, i + DB_BATCH_SIZE);
                    await db.saveTweets(user.id, batch);
                    // Add small delay between batches
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                break; // Success - exit retry loop
            }
            catch (error) {
                retryCount++;
                console.error(`Database operation failed (attempt ${retryCount}/${MAX_RETRIES}):`, error);
                if (retryCount === MAX_RETRIES) {
                    throw error; // Re-throw if all retries failed
                }
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            }
        }
        // Send completion message
        console.log('Sending completion message:', {
            totalCollected,
            maxTweets,
            batchCount,
            MAX_BATCHES,
            completionStatus
        });
        worker_threads_1.parentPort.postMessage({
            type: 'complete',
            progress: 100,
            status: completionStatus,
            phase: 'complete',
            scanProgress: {
                phase: 'complete',
                count: totalCollected,
                total: maxTweets,
                currentBatch: batchCount,
                totalBatches: MAX_BATCHES
            },
            tweets: allTweets.map(tweet => transformer_1.TwitterDataTransformer.toTweet(tweet))
        });
    }
    catch (error) {
        // Send error message
        console.error('Worker error:', error);
        worker_threads_1.parentPort.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            progress: 0
        });
        throw error;
    }
    finally {
        // Ensure we always try to send a final message
        if (db) {
            try {
                await db.disconnect();
            }
            catch (error) {
                console.error('Error closing database:', error);
            }
        }
    }
}
// Run the scraper
runTwitterScraper();
