import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getAuthenticatedTwitterClient } from '@/lib/twitter/api';
import { TwitterDataTransformer } from '@/lib/twitter/transformer';
import { initDB } from '@/lib/db';
import { WorkerPool } from '../../../lib/worker-pool';

// Encoder for Server-Sent Events
const encoder = new TextEncoder();

// Create a singleton instance
const workerPool = new WorkerPool();

export async function POST(request: NextRequest) {
  // Debug logging
  console.log('Environment variables check:', {
    hasTwitterApiKey: Boolean(process.env.TWITTER_API_KEY),
    twitterApiKey: process.env.TWITTER_API_KEY?.substring(0, 4) + '...',
    hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
    hasTwitterClientId: Boolean(process.env.TWITTER_CLIENT_ID)
  });

  const session = await getServerSession(authOptions);
  if (!session?.username) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { username, sessionId } = await request.json();
    if (!username || !sessionId) {
      return NextResponse.json(
        { error: 'Username and sessionId are required' },
        { status: 400 }
      );
  }
  
    // Initialize database
    const db = await initDB();
    
    // Get or create user
    let user = await db.getUserByUsername(username);
    if (!user) {
      user = await db.createUser({
        username,
        twitter_username: username,
        created_at: new Date()
      });
    }

    // Create stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const client = await getAuthenticatedTwitterClient();

    // Start background processing
    (async () => {
    try {
        // Get user profile first
        const profile = await client.getUserProfile({ userName: username });
        const dbProfile = TwitterDataTransformer.toDBUser(profile);
        await db.saveUserProfile(username, dbProfile);

        // Send profile update
        await writer.write(encoder.encode(
          `data: ${JSON.stringify({
            type: 'profile',
            username,
            profile: TwitterDataTransformer.toProfile(profile)
          })}\n\n`
        ));

        // Fetch all tweets with pagination
        const allTweets = [];
        let hasNextPage = true;
        let nextCursor: string | undefined;
        let totalProcessed = 0;

        while (hasNextPage) {
          // Get tweets for current page
          const response = await client.getUserTweets({
            userName: username,
            cursor: nextCursor,
            includeReplies: true
          });

          // Transform tweets
          const transformedTweets = response.tweets.map(tweet => 
            TwitterDataTransformer.toTweet(tweet)
          );

          // Convert to DB format
          const dbTweets = TwitterDataTransformer.toDBTweets(response.tweets, user.id);
          
          // Save to database
          await db.saveTweets(user.id, dbTweets);

          // Update totals
          totalProcessed += transformedTweets.length;
          allTweets.push(...transformedTweets);

          // Send progress update with improved logging
          await writer.write(encoder.encode(
            `data: ${JSON.stringify({
              type: 'progress',
              username,
              tweets: transformedTweets,
              isChunk: true,
              chunkIndex: allTweets.length,
              totalTweets: totalProcessed,
              scanProgress: {
                phase: 'posts',
                count: totalProcessed,
                message: `Tweet found! (${totalProcessed}/${response.tweets.length})\n${transformedTweets[0]?.text || 'No text available'}`
              }
            })}\n\n`
          ));

          // Update pagination state
          hasNextPage = response.hasNextPage;
          nextCursor = response.nextCursor;

          // Break if we have enough tweets
          if (allTweets.length >= 1000) {
            break;
          }

          // Get metrics for monitoring
          const metrics = client.getMetrics(`/user/last_tweets?userName=${username}`);
          if (metrics.rateLimitStatus?.remaining === 0) {
            // Send rate limit warning
            await writer.write(encoder.encode(
              `data: ${JSON.stringify({
                type: 'warning',
                message: 'Rate limit reached, waiting for reset',
                reset: metrics.rateLimitStatus.reset
              })}\n\n`
            ));
          }
        }

        // Send completion message
        await writer.write(encoder.encode(
          `data: ${JSON.stringify({
            type: 'complete',
            username,
            totalTweets: allTweets.length,
            scanProgress: {
              phase: 'complete',
              count: allTweets.length
            }
          })}\n\n`
        ));

        await writer.close();
    } catch (error) {
        // Send error message
        await writer.write(encoder.encode(
          `data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })}\n\n`
        ));
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Scrape error:', error);
    return NextResponse.json(
      { error: 'Failed to start scraping' },
      { status: 500 }
    );
  }
}

// Add an endpoint to get worker pool status
export async function GET() {
  return Response.json(workerPool.getStatus())
} 