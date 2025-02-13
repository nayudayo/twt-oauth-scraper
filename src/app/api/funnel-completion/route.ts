import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'

// POST /api/funnel-completion
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, completionData } = body

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const db = await initDB()

    // First get or create user to get the database user ID
    let user = await db.getUserByUsername(userId)
    if (!user) {
      user = await db.createUser({
        username: userId,
        created_at: new Date()
      })
      console.log('Created new user:', user)
    }

    // Check if already completed
    const existing = await db.getFunnelCompletion(user.id)
    if (existing) {
      return NextResponse.json({ error: 'Funnel already completed' }, { status: 400 })
    }

    // Mark as completed using the database user ID
    await db.markFunnelComplete({
      user_id: user.id,
      completed_at: new Date(),
      completion_data: completionData
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to mark funnel as completed:', error)
    return NextResponse.json({ error: 'Failed to update completion status' }, { status: 500 })
  }
}

// GET /api/funnel-completion?userId={userId}
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const db = await initDB()

    // Get user to get the database user ID
    const user = await db.getUserByUsername(userId)
    if (!user) {
      return NextResponse.json({ completion: null })
    }

    const completion = await db.getFunnelCompletion(user.id)
    return NextResponse.json({ completion })
  } catch (error) {
    console.error('Failed to get funnel completion:', error)
    return NextResponse.json({ error: 'Failed to get completion status' }, { status: 500 })
  }
}