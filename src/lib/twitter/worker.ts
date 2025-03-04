import { parentPort, workerData } from 'worker_threads';
import { TwitterAPIClient } from './client';
import { TwitterDataTransformer } from './transformer';
import { initDB } from '../db';
import type { DBUser, DBTweet } from '../db/adapters/types';
import type { TwitterAPITweet, WorkerData } from './types';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread');
}

// Add termination signal handling
let isTerminating = false;

if (parentPort) {
  parentPort.on('message', (message) => {
    if (message.type === 'terminate') {
      console.log('Received termination signal');
      isTerminating = true;
    }
  });
}

async function runTwitterScraper() {
  let db = null;
  try {
    const { username: targetUsername, sessionId, batchSize = 100, maxTweets = 500 } = workerData as WorkerData;

    // Send initialization progress
    parentPort!.postMessage({ 
      progress: 5, 
      status: 'Initializing Twitter API client...',
      phase: 'init',
      scanProgress: { phase: 'init', count: 0 }
    });

    // Initialize Twitter client
    const client = new TwitterAPIClient(sessionId);

    // Get user profile first
    parentPort!.postMessage({ 
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
    parentPort!.postMessage({ 
      progress: 20, 
      status: 'Starting tweet collection...',
      phase: 'posts',
      scanProgress: { phase: 'posts', count: 0 }
    });

    const allTweets: TwitterAPITweet[] = [];
    let hasNextPage = true;
    let nextCursor: string | undefined;
    let totalProcessed = 0;

    while (hasNextPage && totalProcessed < maxTweets && !isTerminating) {
      // Get tweets for current page
      const response = await client.getUserTweets({
        userName: targetUsername,
        cursor: nextCursor,
        includeReplies: true
      });

      // Transform tweets using the transformer to ensure consistent date handling
      const transformedTweets = response.tweets
        .filter(tweet => tweet.id) // Only filter out tweets without IDs
        .map(tweet => TwitterDataTransformer.toTweet(tweet));

      // Add transformed tweets to collection
      allTweets.push(...response.tweets.filter(tweet => tweet.id));
      totalProcessed += transformedTweets.length;

      // Calculate remaining tweets to collect
      const remainingTweets = maxTweets - totalProcessed;

      // Send progress update
      parentPort!.postMessage({
        progress: Math.min(80, 20 + Math.floor((totalProcessed / maxTweets) * 60)),
        status: `Collecting tweets (${totalProcessed}/${Math.min(maxTweets, totalProcessed + remainingTweets)})...`,
        phase: 'posts',
        scanProgress: { phase: 'posts', count: totalProcessed },
        tweets: transformedTweets,
        isChunk: true,
        chunkIndex: allTweets.length
      });

      // Get metrics for monitoring
      const metrics = client.getMetrics(`/user/tweets?userName=${targetUsername}`);
      if (metrics.rateLimitStatus?.remaining === 0) {
        // Send rate limit warning
        parentPort!.postMessage({
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
    db = await initDB();

    // Create user profile
    const dbUser: Partial<DBUser> = {
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
    const dbTweets: DBTweet[] = allTweets.map(tweet => TwitterDataTransformer.toDBTweet(tweet, user.id));

    // Save tweets in batches
    for (let i = 0; i < dbTweets.length; i += batchSize) {
      const batch = dbTweets.slice(i, i + batchSize);
      await db.saveTweets(user.id, batch);
    }

    // Send completion message
    parentPort!.postMessage({
      progress: 100,
      status: `Tweet collection complete (${totalProcessed} tweets)`,
      phase: 'complete',
      scanProgress: { phase: 'complete', count: totalProcessed },
      tweets: allTweets.map(tweet => TwitterDataTransformer.toTweet(tweet))
    });

  } catch (error) {
    // Send error message
    parentPort!.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Run the scraper
runTwitterScraper(); 