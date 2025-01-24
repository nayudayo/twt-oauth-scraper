"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const apify_client_1 = require("apify-client");
const dotenv = __importStar(require("dotenv"));
const db_1 = require("./db");
if (!worker_threads_1.parentPort) {
    throw new Error('This file must be run as a worker thread');
}
// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });
// Log token for debugging (we'll remove this after confirming it works)
console.log('Apify token in worker:', process.env.APIFY_API_TOKEN ? 'Found' : 'Not found');
// Type guard for Apify tweet item
function isValidTweetItem(item) {
    return (typeof item.id === 'string' &&
        typeof item.text === 'string' &&
        typeof item.createdAt === 'string' &&
        typeof item.url === 'string');
}
// Initialize the ApifyClient with API token
dotenv.config();
const client = new apify_client_1.ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});
async function runScraper() {
    try {
        const { username: targetUsername } = worker_threads_1.workerData; // This is the profile we want to scrape
        // Send initialization progress
        worker_threads_1.parentPort.postMessage({ progress: 5, status: 'Starting Apify scraper...' });
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
        };
        worker_threads_1.parentPort.postMessage({ progress: 20, status: 'Starting tweet collection...' });
        // Collect tweets
        const allTweets = [];
        let offset = 0;
        const batchSize = 500;
        const seenTweetIds = new Set();
        let unchangedCount = 0;
        let totalAttempts = 0;
        while (true) {
            totalAttempts++;
            console.log(`\nAttempt ${totalAttempts}: Fetching batch starting at offset ${offset}...`);
            // Run the Actor with current offset
            const run = await client.actor("CJdippxWmn9uRfooo").call(Object.assign(Object.assign({}, input), { maxItems: batchSize, offset: offset }));
            // Fetch results from the dataset
            const { items } = await client.dataset(run.defaultDatasetId).listItems();
            const rawItems = items;
            if (rawItems.length === 0) {
                console.log(`No more tweets found after ${totalAttempts} attempts.`);
                break;
            }
            const beforeCount = seenTweetIds.size;
            // Add only unique tweets
            rawItems.forEach(rawItem => {
                if (isValidTweetItem(rawItem) && !seenTweetIds.has(rawItem.id)) {
                    seenTweetIds.add(rawItem.id);
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
                    });
                }
            });
            const newUniqueCount = seenTweetIds.size;
            console.log(`Attempt ${totalAttempts}: Fetched ${rawItems.length} tweets, ${newUniqueCount - beforeCount} new unique tweets. Total unique tweets so far: ${allTweets.length}`);
            // Send progress update
            worker_threads_1.parentPort.postMessage({
                progress: Math.min(80, 20 + Math.floor((allTweets.length / 500) * 60)),
                status: 'Collecting tweets...',
                phase: 'posts',
                scanProgress: { phase: 'posts', count: allTweets.length }
            });
            // Check if we got any new unique tweets
            if (newUniqueCount === beforeCount) {
                unchangedCount++;
                console.log(`No new unique tweets found. Failed attempts: ${unchangedCount}/2`);
                if (unchangedCount >= 2) {
                    console.log(`Stopping after ${totalAttempts} total attempts - no new unique tweets in last 2 attempts.`);
                    break;
                }
            }
            else {
                unchangedCount = 0; // Reset counter if we found new unique tweets
            }
            // Only check batch size after at least 2 attempts
            if (totalAttempts >= 2 && rawItems.length < batchSize) {
                console.log(`Last batch was not full. Stopping after ${totalAttempts} attempts.`);
                break;
            }
            offset += batchSize;
        }
        console.log(`\nFinished fetching after ${totalAttempts} attempts. Total unique tweets: ${allTweets.length}`);
        // Create profile data with number types for storage
        const profile = {
            name: targetUsername,
            bio: null,
            followersCount: null,
            followingCount: null
        };
        // Initialize database and save tweets
        const db = await (0, db_1.initDB)();
        await (0, db_1.saveUserProfile)(db, targetUsername, profile);
        await (0, db_1.saveTweets)(db, targetUsername, allTweets);
        console.log('Tweets saved to database');
        // Send progress update
        worker_threads_1.parentPort.postMessage({
            progress: 90,
            status: 'Tweet collection complete',
            phase: 'complete',
            scanProgress: { phase: 'complete', count: allTweets.length },
            tweets: allTweets
        });
        // Send final data
        worker_threads_1.parentPort.postMessage({
            progress: 100,
            status: 'Complete',
            type: 'complete',
            data: {
                profile,
                tweets: allTweets
            }
        });
        // Add explicit completion message
        worker_threads_1.parentPort.postMessage({
            type: 'done',
            progress: 100,
            status: 'Scraping completed'
        });
    }
    catch (error) {
        console.error('❌ Scrape error:', error);
        worker_threads_1.parentPort.postMessage({
            error: error instanceof Error ? error.message : 'Scrape failed',
            progress: 0
        });
    }
}
// Start the scraping process
runScraper();
