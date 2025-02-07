import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    console.log('GET /api/tweets/[username]/all called')
    // Get username from URL instead of params
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const username = pathParts[pathParts.length - 2] // Get username from path
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

    // Get user ID first, create if doesn't exist
    let user = await db.get('SELECT id FROM users WHERE username = ?', username)
    console.log('User found:', user ? 'yes' : 'no')
    
    if (!user) {
      // Create a basic user record if it doesn't exist
      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
      await db.run(
        `INSERT INTO users (id, username) VALUES (?, ?)`,
        [userId, username]
      )
      user = { id: userId }
      console.log('Created new user with ID:', userId)
    }

    // Fetch all tweets for this user, ordered by timestamp
    const tweets = await db.all(`
      SELECT 
        t.id,
        t.text,
        t.created_at as timestamp,
        t.url,
        t.is_reply as isReply,
        t.metadata
      FROM tweets t
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
    `, user.id)

    console.log('Found tweets:', tweets.length)

    // Parse metadata JSON if it exists
    const processedTweets = tweets.map(tweet => ({
      ...tweet,
      metadata: tweet.metadata ? JSON.parse(tweet.metadata) : null
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