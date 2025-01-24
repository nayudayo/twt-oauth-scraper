import { NextResponse } from 'next/server'
import { initDB, getUserTweets } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const username = url.searchParams.get('username')
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    console.log(`API: Fetching tweets for user ${username}`)
    const db = await initDB()
    console.log('API: Database initialized')
    
    const tweets = await getUserTweets(db, username)
    console.log(`API: Found ${tweets.length} tweets`)
    
    return NextResponse.json({ tweets })
  } catch (error) {
    console.error('API Error fetching tweets:', error)
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tweets' },
      { status: 500 }
    )
  }
} 