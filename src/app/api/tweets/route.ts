import { NextResponse } from 'next/server'
import { initDB, getUserTweets } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const username = url.searchParams.get('username')
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const db = await initDB()
    const tweets = await getUserTweets(db, username)
    
    return NextResponse.json({ tweets })
  } catch (error) {
    console.error('Error fetching tweets:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tweets' },
      { status: 500 }
    )
  }
} 