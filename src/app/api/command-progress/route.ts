import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'

// GET /api/command-progress?userId={userId}
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    console.log('Fetching progress for user:', userId)
    const db = await initDB()

    // First get or create user
    let user = await db.getUserByUsername(userId)
    if (!user) {
      user = await db.createUser({
        username: userId,
        created_at: new Date()
      })
      console.log('Created new user:', user)
    }
    
    // Get both progress and completion status
    const [progress, completion] = await Promise.all([
      db.getFunnelProgress(user.id),
      db.getFunnelCompletion(user.id)
    ])

    console.log('Retrieved progress:', { progress, completion })
    return NextResponse.json({ progress, completion })
  } catch (error) {
    console.error('Failed to get command progress:', error)
    return NextResponse.json({ 
      error: 'Failed to get progress',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// POST /api/command-progress
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, currentIndex, completedCommands, commandResponses } = body

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    console.log('Saving progress:', {
      userId,
      currentIndex,
      completedCommands,
      commandResponses
    })

    const db = await initDB()

    // First get or create user
    let user = await db.getUserByUsername(userId)
    if (!user) {
      user = await db.createUser({
        username: userId,
        created_at: new Date()
      })
      console.log('Created new user:', user)
    }

    // Update progress using the database user ID
    await db.updateFunnelProgress(user.id, {
      commandIndex: currentIndex,
      completedCommands,
      responses: commandResponses
    })

    // Verify the update by fetching the current progress
    const updatedProgress = await db.getFunnelProgress(user.id)
    console.log('Progress updated:', updatedProgress)

    return NextResponse.json({ 
      success: true,
      progress: updatedProgress
    })
  } catch (error) {
    console.error('Failed to update command progress:', error)
    return NextResponse.json({ 
      error: 'Failed to update progress',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 