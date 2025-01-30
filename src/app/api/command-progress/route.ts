import { NextResponse } from 'next/server'
import { initDB, getFunnelProgress, updateFunnelProgress, checkFunnelCompletion } from '@/lib/db'
import { getServerSession } from 'next-auth'

// GET /api/command-progress?userId={userId}
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

    // Verify the user is requesting their own progress
    if (userId !== session.user.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = await initDB()
    const progress = await getFunnelProgress(db, userId)
    const completion = await checkFunnelCompletion(db, userId)

    return NextResponse.json({ progress, completion })
  } catch (error) {
    console.error('Error getting funnel progress:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/command-progress
export async function POST(request: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, currentIndex, completedCommands, commandResponses } = body

    if (!userId || typeof currentIndex !== 'number' || !Array.isArray(completedCommands) || typeof commandResponses !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Verify the user is updating their own progress
    if (userId !== session.user.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = await initDB()
    
    // Check if user has already completed the funnel
    const completion = await checkFunnelCompletion(db, userId)
    if (completion) {
      return NextResponse.json({ error: 'Funnel already completed' }, { status: 400 })
    }

    await updateFunnelProgress(db, userId, currentIndex, completedCommands, commandResponses)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating funnel progress:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 