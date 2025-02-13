import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'
import type { DBTweet } from '@/lib/db/adapters/types'
import { getServerSession } from 'next-auth'

export async function GET(req: NextRequest) {
  try {
    console.log('GET /api/tweets/[username]/all called')
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const username = pathParts[pathParts.length - 2]
    console.log('Fetching tweets for username:', username)
    
    // Validate username parameter
    if (!username || typeof username !== 'string') {
      console.error('Invalid username parameter')
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    const db = await initDB()
    console.log('Database initialized')

    // Try to find user by OAuth username first
    let user = await db.getUserByUsername(username)
    console.log('User found by OAuth username:', user ? 'yes' : 'no')
    
    if (!user) {
      // If not found, try to find by Twitter username
      user = await db.getUserByTwitterUsername(username)
      console.log('User found by Twitter username:', user ? 'yes' : 'no')
    } else {
      // If found by OAuth username, check if they have a Twitter username and get that user instead
      if (user.twitter_username) {
        const twitterUser = await db.getUserByTwitterUsername(user.twitter_username)
        if (twitterUser) {
          console.log('Found user by linked Twitter username:', twitterUser.twitter_username)
          user = twitterUser
        }
      }
    }
    
    if (!user) {
      // Create new user only if this is the authenticated user's request
      const session = await getServerSession()
      if (session?.user?.name === username) {
        user = await db.createUser({
          username: username,
          twitter_username: undefined, // Will be set when tweets are scraped
          created_at: new Date()
        })
        console.log('Created new user with ID:', user.id)
      } else {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }
    }

    // Fetch tweets using the user's ID
    const tweets = await db.getTweetsByUserId(user.id, {
      limit: 1000,
      includeReplies: true
    })

    console.log('Found tweets:', tweets.length)

    // Process tweets - metadata is already parsed by the PostgreSQL adapter
    const processedTweets = tweets.map((tweet: DBTweet) => ({
      id: tweet.id,
      text: tweet.text,
      timestamp: tweet.created_at,
      url: tweet.url,
      isReply: tweet.is_reply,
      metadata: tweet.metadata
    }))

    console.log('Returning processed tweets:', processedTweets.length)
    return NextResponse.json(processedTweets)

  } catch (error) {
    console.error('Error fetching tweets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tweets' },
      { status: 500 }
    )
  }
} 