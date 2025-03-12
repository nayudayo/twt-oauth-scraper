import { NextRequest, NextResponse } from 'next/server';
import { initDB } from '@/lib/db';
import { TweetDB } from '@/lib/db/tweets';
import { RateLimiter } from '@/lib/rate-limiter';

// Cache TTL in seconds
const CACHE_TTL = 60 * 5; // 5 minutes
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  max: 30 // 30 requests per minute
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get('username');
    const cursor = url.searchParams.get('cursor');
    const limit = url.searchParams.get('limit');
    const includeReplies = url.searchParams.get('includeReplies') === 'true';

    // Validate required parameters
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Rate limiting
    const rateLimiter = new RateLimiter('tweets-api');
    const rateLimitResult = await rateLimiter.checkLimit(username);
    
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': RATE_LIMIT.max.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.reset.toString()
          }
        }
      );
    }

    // Get fresh data from database
    const db = await initDB();
    const user = await db.getUserByUsername(username);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get paginated tweets
    const tweets = await TweetDB.getTweets({
      userId: user.id,
      cursor: cursor || undefined,
      limit: limit ? parseInt(limit) : undefined,
      includeReplies
    });

    return NextResponse.json(tweets, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-RateLimit-Limit': RATE_LIMIT.max.toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.reset.toString()
      }
    });
  } catch (error) {
    console.error('Failed to get paginated tweets:', error);
    return NextResponse.json(
      { error: 'Failed to get tweets' },
      { status: 500 }
    );
  }
} 