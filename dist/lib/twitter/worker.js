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
async function runTwitterScraper() {
    var _a;
    let db = null;
    try {
        const { username: targetUsername, sessionId, batchSize = 100, maxTweets = 500 } = worker_threads_1.workerData;
        // Send initialization progress
        worker_threads_1.parentPort.postMessage({
            progress: 5,
            status: 'Initializing Twitter API client...',
            phase: 'init',
            scanProgress: { phase: 'init', count: 0 }
        });
        // Initialize Twitter client
        const client = new client_1.TwitterAPIClient(sessionId);
        // Get user profile first
        worker_threads_1.parentPort.postMessage({
            progress: 10,
            status: 'Fetching user profile...',
            phase: 'profile',
            scanProgress: { phase: 'profile', count: 0 }
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
            scanProgress: { phase: 'posts', count: 0 }
        });
        const allTweets = [];
        let hasNextPage = true;
        let nextCursor;
        let totalProcessed = 0;
        while (hasNextPage && totalProcessed < maxTweets && !isTerminating) {
            // Get tweets for current page
            const response = await client.getUserTweets({
                userName: targetUsername,
                cursor: nextCursor,
                includeReplies: true
            });
            // Filter valid tweets and store raw API response
            const validTweets = response.tweets.filter(tweet => tweet.id);
            // Transform tweets for progress reporting only
            const transformedTweets = validTweets.map(tweet => transformer_1.TwitterDataTransformer.toTweet(tweet));
            // Add raw tweets to collection
            allTweets.push(...validTweets);
            totalProcessed += validTweets.length;
            // Calculate remaining tweets to collect
            const remainingTweets = maxTweets - totalProcessed;
            // Send progress update with transformed tweets
            worker_threads_1.parentPort.postMessage({
                progress: Math.min(80, 20 + Math.floor((totalProcessed / maxTweets) * 60)),
                status: `Collecting tweets (${totalProcessed}/${Math.min(maxTweets, totalProcessed + remainingTweets)})...`,
                phase: 'posts',
                scanProgress: {
                    phase: 'posts',
                    count: totalProcessed,
                    message: transformedTweets.length > 0 ?
                        `Tweet found! (${totalProcessed}/${maxTweets})\n${transformedTweets[0].text}` :
                        `Processing tweets (${totalProcessed}/${maxTweets})`
                },
                tweets: transformedTweets,
                isChunk: true,
                chunkIndex: allTweets.length
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
            hasNextPage = response.hasNextPage &&
                transformedTweets.length > 0 &&
                totalProcessed < maxTweets;
            nextCursor = response.nextCursor;
            // Add a small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        // Check for termination before database operations
        if (isTerminating) {
            throw new Error('Operation cancelled by user');
        }
        // Initialize database
        db = await (0, db_1.initDB)();
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
        // Convert tweets to database format
        const dbTweets = allTweets.map(tweet => transformer_1.TwitterDataTransformer.toDBTweet(tweet, user.id));
        // Save tweets in batches
        for (let i = 0; i < dbTweets.length; i += batchSize) {
            const batch = dbTweets.slice(i, i + batchSize);
            await db.saveTweets(user.id, batch);
        }
        // Send completion message
        worker_threads_1.parentPort.postMessage({
            progress: 100,
            status: `Tweet collection complete (${totalProcessed} tweets)`,
            phase: 'complete',
            scanProgress: { phase: 'complete', count: totalProcessed },
            tweets: allTweets.map(tweet => transformer_1.TwitterDataTransformer.toTweet(tweet))
        });
    }
    catch (error) {
        // Send error message
        worker_threads_1.parentPort.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}
// Run the scraper
runTwitterScraper();
