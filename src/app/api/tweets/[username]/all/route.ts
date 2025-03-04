import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth/config'
import { initDB } from '@/lib/db'

// Cache configuration
const CACHE_MAX_AGE = 60 * 5; // 5 minutes
const STALE_WHILE_REVALIDATE = 60 * 60; // 1 hour

// HTTP method configuration
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    // Extract username from URL using URL parsing
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const username = pathParts[pathParts.indexOf('tweets') + 1];

    // Validate session first
    const session = await getServerSession(authOptions)
    if (!session?.username) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Now we can use session in our logging
    console.log('API Route: Fetching tweets for username:', {
      requestUrl: request.url,
      pathParts,
      extractedUsername: username,
      sessionUsername: session?.username
    });

    // Initialize database
    const db = await initDB()

    // Get user by username
    const user = await db.getUserByUsername(username)
    console.log('API Route: User lookup result:', {
      username,
      userFound: !!user,
      userId: user?.id
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Fetch tweets from database
    const tweets = await db.getTweetsByUserId(user.id, {
      includeReplies: true
    })
    console.log('API Route: Fetched tweets:', {
      userId: user.id,
      tweetCount: tweets.length,
      firstTweetId: tweets[0]?.id,
      lastTweetId: tweets[tweets.length - 1]?.id
    });

    // Create cache headers
    const headers = new Headers()
    headers.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`)

    return NextResponse.json(
      tweets,
      {
        headers,
        status: 200
      }
    )
  } catch (error) {
    console.error('Failed to fetch tweets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tweets' },
      { status: 500 }
    )
  }
} 