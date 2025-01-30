import { NextResponse } from 'next/server'
import { initDB, markFunnelCompleted, checkFunnelCompletion } from '@/lib/db'
import { getServerSession } from 'next-auth'

// POST /api/funnel-completion
export async function POST(request: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, completionData } = body

    if (!userId || typeof completionData !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Verify the user is marking their own completion
    if (userId !== session.user.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = await initDB()
    
    // Check if already completed
    const existing = await checkFunnelCompletion(db, userId)
    if (existing) {
      return NextResponse.json({ error: 'Funnel already completed' }, { status: 400 })
    }

    // Mark as completed
    await markFunnelCompleted(db, userId, completionData)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking funnel as completed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/funnel-completion?userId={userId}
export async function GET(request: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 })
    }

    // Verify the user is checking their own completion status
    if (userId !== session.user.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = await initDB()
    const completion = await checkFunnelCompletion(db, userId)

    return NextResponse.json({ completion })
  } catch (error) {
    console.error('Error checking funnel completion:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 