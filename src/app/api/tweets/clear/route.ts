import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'

export async function DELETE(request: NextRequest) {
  try {
    const { username } = await request.json()

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    const db = await initDB()

    // Get user by username
    const user = await db.getUserByUsername(username)
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Use transaction to ensure both operations complete or neither does
    await db.transaction(async () => {
      // Delete all tweets for this user
      await db.deleteTweetsByUserId(user.id)
      
      // Update user profile to clear data
      await db.updateUser(user.id, {
        profile_data: {},
        profile_picture_url: undefined,
        last_scraped: undefined
      })
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error clearing tweets:', error)
    return NextResponse.json(
      { error: 'Failed to clear tweets' },
      { status: 500 }
    )
  }
} 