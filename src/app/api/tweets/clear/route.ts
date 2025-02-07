import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db'

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

    // Get user ID first
    const user = await db.get('SELECT id FROM users WHERE username = ?', username)
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Delete all tweets for this user
    await db.run('DELETE FROM tweets WHERE user_id = ?', user.id)

    // Delete user profile data but keep the user record
    await db.run(
      `UPDATE users 
       SET profile_data = NULL, 
           profile_picture_url = NULL, 
           last_scraped = NULL 
       WHERE id = ?`, 
      user.id
    )

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error clearing tweets:', error)
    return NextResponse.json(
      { error: 'Failed to clear tweets' },
      { status: 500 }
    )
  }
} 