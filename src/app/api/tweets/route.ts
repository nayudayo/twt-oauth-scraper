import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const username = url.searchParams.get('username')
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const db = await initDB()

    // Get user first
    const user = await db.getUserByUsername(username)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get tweets for user
    const tweets = await db.getTweetsByUserId(user.id)
    return NextResponse.json(tweets)
  } catch (error) {
    console.error('Failed to get tweets:', error)
    return NextResponse.json({ error: 'Failed to get tweets' }, { status: 500 })
  }
} 