import { NextRequest, NextResponse } from 'next/server'
import { dbQueue } from '@/lib/queue'

export async function POST(request: NextRequest) {
  try {
    const { username, sessionId, tweets } = await request.json()

    if (!username || !tweets) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Add to queue instead of direct database write
    await dbQueue.addToQueue(username, sessionId, tweets)

    return NextResponse.json({ 
      success: true,
      message: 'Tweets queued for processing',
      queuedCount: tweets.length
    })

  } catch (error) {
    console.error('Error queueing tweets:', error)
    return NextResponse.json(
      { error: 'Failed to queue tweets' },
      { status: 500 }
    )
  }
} 